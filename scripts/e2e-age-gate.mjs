#!/usr/bin/env node
/**
 * Regression suite for the age-confirmation gate.
 *
 * Contract under test (see src/lib/consent/ageGate.ts):
 *  - the gate runs ONLY while an account is being created;
 *  - existing-user sign-in — email/password or any OAuth provider — is never
 *    blocked by it, and reports `bypass`;
 *  - a new account cannot be created without ticking the age box;
 *  - refreshing or bouncing through /auth neither resets nor bypasses it;
 *  - signed-out deep links to protected routes land on /auth, not past it.
 *
 * No date of birth is collected and no under-age marker is stored, so there is
 * deliberately nothing here that inspects persistent client state.
 *
 * Usage: node scripts/e2e-age-gate.mjs [baseUrl]
 */
import { chromium } from "playwright";
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const BASE = (process.argv[2] ?? process.env.SMOKE_BASE_URL ?? "http://localhost:8080").replace(/\/$/, "");
const results = [];

function findChromium() {
  for (const envPath of [process.env.PLAYWRIGHT_CHROMIUM_PATH, process.env.CHROME_PATH]) {
    if (envPath && existsSync(envPath)) return envPath;
  }
  for (const root of ["/opt/ms-playwright", join(homedir(), ".cache/ms-playwright")]) {
    if (!existsSync(root)) continue;
    for (const dir of readdirSync(root).filter((d) => d.startsWith("chromium"))) {
      for (const rel of [
        "chrome-linux/chrome",
        "chrome-linux/headless_shell",
        "chrome-linux64/chrome-headless-shell",
      ]) {
        const candidate = join(root, dir, rel);
        if (existsSync(candidate)) return candidate;
      }
    }
  }
  return undefined;
}

function record(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const AGE_BOX = "#consent-age";
const TERMS_BOX = "#consent-terms";
const CONSENT_ERROR = "#consent-error";

/** Collects `age_gate_result` payloads emitted by src/lib/analytics.ts. */
const EVENT_SINK = "__age_gate_events";

/**
 * Collects `age_gate_result` payloads emitted by src/lib/analytics.ts.
 * Installed as an init script and mirrored into sessionStorage so the OAuth
 * handoff (a full-page navigation) cannot swallow the evidence.
 */
async function instrumentAnalytics(context) {
  await context.addInitScript((sink) => {
    window.addEventListener("app:analytics", (e) => {
      const detail = e.detail ?? {};
      if (detail.event !== "age_gate_result") return;
      try {
        const prev = JSON.parse(window.sessionStorage.getItem(sink) ?? "[]");
        prev.push(detail);
        window.sessionStorage.setItem(sink, JSON.stringify(prev));
      } catch {
        /* storage unavailable */
      }
    });
  }, EVENT_SINK);
}

const readEvents = (page) =>
  page.evaluate((sink) => {
    try {
      return JSON.parse(window.sessionStorage.getItem(sink) ?? "[]");
    } catch {
      return [];
    }
  }, EVENT_SINK);

const clearEvents = (page) =>
  page.evaluate((sink) => window.sessionStorage.removeItem(sink), EVENT_SINK);

async function fillSignupForm(page, email) {
  await page.getByLabel(/full name/i).first().fill("Regression Tester").catch(() => {});
  await page.getByLabel(/email/i).first().fill(email);
  await page.getByLabel(/password/i).first().fill("Sup3rSecret!pw");
}

async function run() {
  const browser = await chromium.launch({ headless: true, executablePath: findChromium() });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    // Never hand control to a real identity provider from a test run.
    await context.route(/accounts\.google\.com|appleid\.apple\.com|login\.microsoftonline\.com/, (r) =>
      r.abort(),
    );
    // Pre-seed the cookie choice so the consent banner never covers the form.
    await context.addInitScript(() => {
      try {
        window.localStorage.setItem(
          "gradr-cookie-consent",
          JSON.stringify({
            version: 1,
            decidedAt: new Date().toISOString(),
            choices: { necessary: true, analytics: true, marketing: false },
          }),
        );
      } catch {
        /* storage unavailable */
      }
    });
    await instrumentAnalytics(context);
    const page = await context.newPage();
    // Close any provider popup the OAuth helper opens.
    page.on("popup", (p) => p.close().catch(() => {}));

    // ---- 1. sign-in tab shows no gate at all ------------------------------
    await page.goto(`${BASE}/auth`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => {});
    record("sign-in tab renders no age gate", (await page.locator(AGE_BOX).count()) === 0);

    // ---- 2. OAuth from the sign-in tab is not blocked ---------------------
    await page.getByRole("button", { name: /continue with google/i }).click().catch(() => {});
    await page.waitForTimeout(700);
    const errAfterOAuth = await page.locator(CONSENT_ERROR).count();
    record("OAuth sign-in is not blocked by the gate", errAfterOAuth === 0);
    const bypassEvents = (await readEvents(page)).filter((e) => e.outcome === "bypass");
    record(
      "OAuth sign-in reports a bypass outcome with its auth method",
      bypassEvents.some((e) => e.auth_method === "google"),
      JSON.stringify(bypassEvents.slice(0, 2)),
    );

    // ---- 3. existing user can sign in with email/password ------------------
    const email = process.env.E2E_EMAIL;
    const password = process.env.E2E_PASSWORD;
    if (email && password) {
      const signIn = await context.newPage();
      // Start on the signup tab: switching to sign in must clear the gate.
      await signIn.goto(`${BASE}/auth?mode=signup`, { waitUntil: "domcontentloaded" });
      await signIn.getByRole("button", { name: /^sign in$/i }).first().click();
      await signIn.getByLabel(/email/i).first().fill(email);
      await signIn.getByLabel(/password/i).first().fill(password);
      await signIn.getByRole("button", { name: /^sign in$/i }).last().click();
      await signIn.waitForURL((u) => new URL(u).pathname === "/", { timeout: 30_000 }).catch(() => {});
      const path = new URL(signIn.url()).pathname;
      record("existing user signs in normally after visiting the signup tab", path === "/", `at ${path}`);
      await signIn.close();
    } else {
      console.log("SKIP  existing-user sign-in (E2E_EMAIL / E2E_PASSWORD not set)");
    }

    // ---- 4. new accounts must complete the age confirmation ---------------
    await page.goto(`${BASE}/auth?mode=signup`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => {});
    await clearEvents(page);
    record("signup tab renders the age gate", (await page.locator(AGE_BOX).count()) === 1);

    const throwaway = `agegate+${Date.now()}@example.invalid`;
    await fillSignupForm(page, throwaway);
    await page.locator(TERMS_BOX).check();
    await page.getByRole("button", { name: /create account/i }).click();
    await page.waitForTimeout(600);
    const blocked =
      (await page.locator(CONSENT_ERROR).count()) === 1 && new URL(page.url()).pathname === "/auth";
    record("signup without the age confirmation is blocked", blocked);
    const ineligible = (await readEvents(page)).filter((e) => e.outcome === "ineligible");
    record(
      "blocked signup reports an ineligible outcome with its auth method",
      ineligible.some((e) => e.auth_method === "email"),
      JSON.stringify(ineligible.slice(0, 2)),
    );

    // ---- 5. refresh does not reset or bypass the gate ---------------------
    await page.locator(AGE_BOX).check();
    record("ticking the box clears the blocking error", (await page.locator(CONSENT_ERROR).count()) === 0);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => {});
    const stillRequired =
      (await page.locator(AGE_BOX).count()) === 1 && !(await page.locator(AGE_BOX).isChecked());
    record("refreshing the signup tab re-requires the confirmation", stillRequired);

    // Bouncing signup -> sign in -> signup must not leave it pre-satisfied.
    await page.getByRole("button", { name: /^sign in$/i }).first().click();
    await page.getByRole("button", { name: /create one/i }).click();
    const afterToggle =
      (await page.locator(AGE_BOX).count()) === 1 && !(await page.locator(AGE_BOX).isChecked());
    record("toggling between tabs does not pre-satisfy the gate", afterToggle);

    // ---- 6. protected routes cannot be reached around the gate ------------
    for (const route of ["/dashboard", "/resume", "/pipeline", "/settings"]) {
      const guard = await context.newPage();
      await guard.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded" });
      await guard.waitForLoadState("networkidle").catch(() => {});
      const p = new URL(guard.url()).pathname;
      record(`signed-out ${route} does not bypass auth`, p === "/auth" || p === "/", `landed on ${p}`);
      await guard.close();
    }

    await context.close();
  } finally {
    await browser.close();
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} age-gate checks passed.`);
  if (failed.length) process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
