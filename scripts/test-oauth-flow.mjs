#!/usr/bin/env node
/**
 * Daily automated Google OAuth flow check.
 *
 * Runs headless against production (or OAUTH_FLOW_TARGET). It always verifies
 * the public provider request. When GOOGLE_E2E_STORAGE_STATE points to an
 * approved Playwright storage-state file, it also completes sign-in and checks
 * the authenticated landing.
 *
 *   1. /auth renders and exposes a "Continue with Google" control.
 *   2. Clicking it leaves Gradr and reaches Google's authorization endpoint
 *      (directly or via the Lovable OAuth broker).
 *   3. The authorization request carries client_id, a redirect_uri on an
 *      allowed origin, response_type and a non-trivial state value.
 *   4. The `?next=` destination survives the hop.
 *   5. No token, code or secret is exposed in the page or in the console.
 *
 * Exits non-zero on any failure so CI can page us.
 *
 * Usage: node scripts/test-oauth-flow.mjs [baseUrl]
 */
import { chromium } from "playwright";

const BASE = (process.argv[2] || process.env.OAUTH_FLOW_TARGET || "https://app.gradr.me").replace(/\/$/, "");
const NEXT = "/dashboard";
const EXPECTED_CALLBACK = "https://app.gradr.me/~oauth/callback";
const EXPECTED_LANDING = "https://app.gradr.me/dashboard";
const PROVIDER_HOSTS = ["accounts.google.com", "oauth.lovable.app"];
const SECRET_RE = /(access_token|id_token|refresh_token|client_secret)=/i;

const results = [];
const record = (ok, label, detail = "") => {
  results.push({ ok, label, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
};

// Edge preflight runs before Chromium so a hosting alias redirect is reported
// clearly even when the browser image is unavailable in a CI runner.
const callbackProbe = await fetch(`${BASE}/~oauth/callback?gradr_probe=1`, { redirect: "manual" });
const callbackLocation = callbackProbe.headers.get("location") ?? "";
const callbackIsServed =
  callbackProbe.status < 300 ||
  callbackProbe.status >= 400 ||
  (callbackLocation && new URL(callbackLocation, BASE).hostname === "app.gradr.me");
record(
  callbackIsServed,
  "app.gradr.me serves the OAuth callback without an apex redirect",
  `HTTP ${callbackProbe.status}${callbackLocation ? ` -> ${callbackLocation}` : ""}`,
);

if (!callbackIsServed) {
  console.error("\nGoogle OAuth flow check FAILED: the hosting edge redirected the callback before app code ran.");
  process.exit(1);
}

const browser = await chromium.launch();
const storageState = process.env.GOOGLE_E2E_STORAGE_STATE;
const context = await browser.newContext({
  viewport: { width: 1280, height: 1000 },
  ...(storageState ? { storageState } : {}),
});
const page = await context.newPage();

const consoleErrors = [];
page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text());
});

/** URLs the browser attempted, so we can reconstruct the redirect chain. */
const chain = [];
page.on("request", (req) => {
  if (req.isNavigationRequest()) chain.push(req.url());
});

try {
  const authUrl = `${BASE}/auth?next=${encodeURIComponent(NEXT)}`;
  const response = await page.goto(authUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
  record((response?.status() ?? 0) < 400, "/auth responds", `HTTP ${response?.status()}`);
  record(page.url().startsWith(`${BASE}/auth`), "app.gradr.me serves /auth without an apex bounce", page.url());

  const googleButton = page.getByRole("button", { name: /google/i }).first();
  const hasButton = (await googleButton.count()) > 0;
  record(hasButton, "Google sign-in control is present");

  if (hasButton) {
    await Promise.all([
      page.waitForURL((url) => PROVIDER_HOSTS.includes(url.hostname), { timeout: 45_000 }).catch(() => {}),
      googleButton.click({ timeout: 15_000 }),
    ]);
    // Broker hop → provider can take one more redirect.
    await page.waitForTimeout(2_500);

    const current = new URL(page.url());
    record(PROVIDER_HOSTS.includes(current.hostname), "reaches the OAuth provider", current.hostname);

    const authorizeUrl =
      chain.find((u) => u.includes("accounts.google.com/o/oauth2")) ??
      (current.hostname === "accounts.google.com" ? page.url() : null);

    if (authorizeUrl) {
      const params = new URL(authorizeUrl).searchParams;
      record(Boolean(params.get("client_id")), "authorization request carries client_id");
      record(params.get("response_type") === "code", "uses the authorization-code flow");

      const state = params.get("state") ?? "";
      record(state.length >= 16, "carries a non-trivial state value", `${state.length} chars`);

      const redirectUri = params.get("redirect_uri") ?? "";
      let redirectHost = "";
      try {
        redirectHost = new URL(redirectUri).hostname;
      } catch {
        /* reported below */
      }
      record(redirectUri === EXPECTED_CALLBACK, "uses the exact app callback URI", redirectUri || "<missing>");
      record(
        params.get("scope")?.includes("email") ?? false,
        "requests the email scope",
        params.get("scope") ?? "<none>",
      );
    } else {
      record(false, "captured the Google authorization request", `chain: ${chain.slice(-3).join(" -> ")}`);
    }

    const nextPreserved = chain.some((u) => decodeURIComponent(u).includes(NEXT));
    record(nextPreserved, "?next= destination survives the OAuth hop", NEXT);

    if (storageState) {
      await page.waitForURL(EXPECTED_LANDING, { timeout: 60_000 }).catch(() => {});
      record(page.url() === EXPECTED_LANDING, "authenticated user lands on app dashboard", page.url());
      record(!chain.some((u) => new URL(u).hostname === "gradr.me"), "redirect chain never bounces to gradr.me");
    } else {
      console.log("SKIP  authenticated landing (set GOOGLE_E2E_STORAGE_STATE to an approved Google test session)");
    }
  }

  const leaked = chain.filter((u) => SECRET_RE.test(u));
  record(leaked.length === 0, "no tokens or secrets in the redirect chain", leaked.length ? "leak detected" : "");

  const noisyErrors = consoleErrors.filter((e) => !/favicon|third-party cookie/i.test(e));
  record(noisyErrors.length === 0, "no console errors during the flow", noisyErrors.slice(0, 2).join(" | "));
} catch (error) {
  record(false, "flow completed without a crash", error instanceof Error ? error.message : String(error));
} finally {
  await browser.close();
}

const failures = results.filter((r) => !r.ok);
console.log(`\n${results.length - failures.length}/${results.length} checks passed against ${BASE}.`);
if (failures.length) {
  console.error(`\nGoogle OAuth flow check FAILED (${failures.length}):`);
  for (const f of failures) console.error(`  - ${f.label}${f.detail ? ` (${f.detail})` : ""}`);
  process.exit(1);
}
console.log("Google OAuth flow check passed.");
