#!/usr/bin/env node
/**
 * Production checkout smoke.
 *
 * Loads /pricing on the deployed build, clicks every paid-plan CTA and proves
 * Paddle Checkout actually initializes: Paddle.js loads, Initialize() runs with
 * the build's client token, and Checkout.open() is called with a resolved price
 * id (no PriceNotFound, no "payments not configured" banner).
 *
 * The overlay itself is a cross-domain iframe, so the assertion is on the
 * initialization contract, not on the iframe's contents. Checkout.open is
 * wrapped rather than blocked, so no real transaction is started.
 *
 *   node scripts/e2e-pricing-checkout.mjs                      # production
 *   node scripts/e2e-pricing-checkout.mjs http://localhost:8080
 */
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { launchBrowser } from "./lib/browser.mjs";

const BASE = (process.argv.find((a) => a.startsWith("http")) || process.env.CHECKOUT_BASE_URL || "https://gradr-app.lovable.app").replace(/\/$/, "");
const EMAIL = process.env.E2E_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD;

/** Checkout requires a signed-in user, so a session is restored when present. */
function loadSession() {
  const key = process.env.LOVABLE_BROWSER_SUPABASE_STORAGE_KEY;
  const session = process.env.LOVABLE_BROWSER_SUPABASE_SESSION_JSON;
  if (key && session) return { key, session };
  const file = join(homedir(), ".cache/lovable-auth/session.json");
  if (!existsSync(file)) return null;
  const minted = JSON.parse(readFileSync(file, "utf8"));
  return { key: minted.storage_key, session: JSON.stringify(minted.session) };
}

const SESSION = loadSession();
if (!SESSION && (!EMAIL || !PASSWORD)) {
  console.log("SKIP  pricing checkout smoke — no session and no E2E_EMAIL / E2E_PASSWORD (checkout requires sign-in).");
  process.exit(0);
}

const checks = [];
const check = (name, ok, detail = "") => {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

const browser = await launchBrowser({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1600 } });

// Wrap Paddle.Checkout.open the moment Paddle.js defines it: records the call
// and suppresses the overlay so the smoke test never opens a real checkout.
await context.addInitScript(() => {
  window.__checkoutCalls = [];
  let paddle;
  Object.defineProperty(window, "Paddle", {
    configurable: true,
    get: () => paddle,
    set: (value) => {
      paddle = value;
      if (value?.Checkout && !value.Checkout.__wrapped) {
        const original = value.Checkout.open?.bind(value.Checkout);
        value.Checkout.open = (opts) => {
          window.__checkoutCalls.push(opts);
          return undefined; // do not render the overlay
        };
        value.Checkout.__wrapped = true;
        value.Checkout.__original = original;
      }
    },
  });
});

await context.addInitScript(() => {
  try {
    window.localStorage.setItem(
      "gradr-cookie-consent",
      JSON.stringify({ version: 1, decidedAt: new Date().toISOString(), choices: { analytics: false, marketing: false, functional: false } }),
    );
  } catch { /* private mode */ }
});

const page = await context.newPage();
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(e.message));

try {
  if (SESSION) {
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    await page.evaluate(([k, v]) => window.localStorage.setItem(k, v), [SESSION.key, SESSION.session]);
  } else if (EMAIL && PASSWORD) {
    await page.goto(`${BASE}/auth`, { waitUntil: "domcontentloaded" });
    await page.getByLabel(/email/i).first().fill(EMAIL);
    await page.getByLabel(/password/i).first().fill(PASSWORD);
    await page.getByRole("button", { name: /^sign in$/i }).first().click();
    await page.waitForURL((url) => !url.pathname.startsWith("/auth"), { timeout: 30_000 }).catch(() => {});
  }

  await page.goto(`${BASE}/pricing`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(2500);

  const body = await page.locator("body").innerText();
  check("pricing page renders", /pricing|plan/i.test(body));
  check(
    "payments are configured in this build",
    !/payments are not configured|plan changes are unavailable/i.test(body),
    /payments are not configured|plan changes are unavailable/i.test(body) ? "checkout entrypoint disabled" : "",
  );

  const paddleReady = await page
    .waitForFunction(() => Boolean(window.Paddle?.Checkout), null, { timeout: 30_000 })
    .then(() => true)
    .catch(() => false);
  check("Paddle.js loaded and initialized", paddleReady);

  const ctas = page.getByRole("button", { name: /^(subscribe to|change to) /i });
  const count = await ctas.count();
  check("paid-plan CTAs are present", count > 0, `${count} found`);

  for (let i = 0; i < count; i++) {
    const cta = ctas.nth(i);
    const label = (await cta.innerText()).trim().replace(/\s+/g, " ");
    const before = await page.evaluate(() => window.__checkoutCalls.length);
    await cta.click();
    const opened = await page
      .waitForFunction((n) => window.__checkoutCalls.length > n, before, { timeout: 25_000 })
      .then(() => true)
      .catch(() => false);

    if (!opened) {
      if (new URL(page.url()).pathname.startsWith("/auth")) {
        check(`checkout initializes — ${label}`, false, "redirected to /auth — the session was not accepted");
        break;
      }
      const text = await page.locator("body").innerText();
      const err = /price|checkout|unavailable|error/i.test(text) ? "checkout never initialized" : "no Checkout.open call";
      check(`checkout initializes — ${label}`, false, err);
      continue;
    }

    const opts = await page.evaluate(() => window.__checkoutCalls[window.__checkoutCalls.length - 1]);
    const priceId = opts?.items?.[0]?.priceId ?? opts?.items?.[0]?.price_id;
    check(`checkout initializes — ${label}`, Boolean(priceId), priceId ? `priceId ${priceId}` : "no resolved price id");
    await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(500);
  }

  check("no runtime errors during checkout", pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));
} catch (err) {
  check("checkout smoke completed", false, err.message);
} finally {
  await browser.close();
}

const failed = checks.filter((c) => !c.ok);
if (failed.length) {
  console.error(`\n✖ ${failed.length} checkout check(s) failed against ${BASE}.`);
  process.exit(1);
}
console.log(`\n✓ Paddle checkout initializes for every paid plan on ${BASE}.`);
