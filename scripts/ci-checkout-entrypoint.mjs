#!/usr/bin/env node
/**
 * Staging checkout-entrypoint smoke.
 *
 * Fails the build when a deployed surface would refuse to sell:
 *   1. `/payments-build.json` exists and reports a usable Paddle token.
 *   2. The inlined token type matches the environment CI expects
 *      (`EXPECTED_PAYMENTS_ENV`, default `sandbox` for staging).
 *   3. `/pricing` renders paid CTAs that are enabled — no "payments are not
 *      configured" banner, no disabled purchase buttons.
 *   4. No console errors on the pricing route (allowlisted noise excluded).
 *
 * Deliberately stops short of opening the overlay: the paid checkout smoke
 * (`scripts/e2e-pricing-checkout.mjs`) covers initialization on production and
 * needs a signed-in session. This one is unauthenticated so it can gate every
 * staging deploy.
 *
 *   node scripts/ci-checkout-entrypoint.mjs https://staging.example.app
 */
import { launchBrowser } from "./lib/browser.mjs";
import { isAllowedConsoleMessage } from "./lib/console-allowlist.mjs";

const BASE = (
  process.argv.find((a) => a.startsWith("http")) ||
  process.env.STAGING_BASE_URL ||
  "http://localhost:8080"
).replace(/\/$/, "");
const EXPECTED_ENV = process.env.EXPECTED_PAYMENTS_ENV || "sandbox";

const checks = [];
const check = (name, ok, detail = "") => {
  checks.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

console.log(`Checkout entrypoint smoke → ${BASE} (expecting ${EXPECTED_ENV})\n`);

// 1 + 2 — build manifest.
let manifest = null;
try {
  const res = await fetch(`${BASE}/payments-build.json`, { cache: "no-store" });
  manifest = res.ok ? await res.json() : null;
  check("payments-build.json is served", !!manifest, manifest ? "" : `HTTP ${res.status}`);
} catch (err) {
  check("payments-build.json is served", false, err.message);
}

if (manifest) {
  check(
    "build has a Paddle client token",
    manifest.tokenType !== "none" && manifest.checkoutEnabled === true,
    `tokenType=${manifest.tokenType}`,
  );
  check(
    `token targets the ${EXPECTED_ENV} environment`,
    manifest.resolvedEnvironment === EXPECTED_ENV,
    `resolved=${manifest.resolvedEnvironment}, env var=${manifest.environmentVar ?? "unset"}`,
  );
  check(
    "no token/environment mismatch",
    manifest.mismatch === false,
    manifest.mismatch ? "VITE_PAYMENTS_ENVIRONMENT disagrees with the token prefix" : "",
  );
}

// 3 + 4 — the pricing page really offers checkout.
const browser = await launchBrowser({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 1800 } });
const page = await context.newPage();

const consoleErrors = [];
page.on("console", (msg) => {
  if (msg.type() !== "error") return;
  const text = msg.text();
  if (!isAllowedConsoleMessage(text)) consoleErrors.push(text);
});
page.on("pageerror", (err) => consoleErrors.push(err.message));

try {
  const response = await page.goto(`${BASE}/pricing`, {
    waitUntil: "domcontentloaded",
    timeout: 45_000,
  });
  check("/pricing responds 200", !!response && response.ok(), `status ${response?.status()}`);
  await page.waitForTimeout(2500);

  const body = (await page.textContent("body")) ?? "";
  check(
    "no payments-misconfigured banner",
    !/payments are not configured|purchases are temporarily unavailable|plan changes are unavailable/i.test(
      body,
    ),
  );
  check(
    "no catalog-unavailable notice",
    !/products (aren't|are not) set up/i.test(body),
  );

  const ctas = page.locator('[data-testid^="plan-cta-"], [data-testid^="pack-cta-"]');
  const total = await ctas.count();
  let enabled = 0;
  for (let i = 0; i < total; i += 1) {
    if (await ctas.nth(i).isEnabled()) enabled += 1;
  }
  check("at least one purchase CTA is enabled", enabled > 0, `${enabled}/${total} enabled`);
  check("no unexpected console errors", consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" | "));
} finally {
  await browser.close();
}

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed.`);
if (failed.length) {
  console.error(`\nCheckout entrypoint is disabled or misconfigured on ${BASE}.`);
  process.exit(1);
}
