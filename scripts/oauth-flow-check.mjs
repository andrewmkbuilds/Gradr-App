#!/usr/bin/env node
/**
 * Daily headless-Chrome OAuth flow check.
 *
 * Walks the real Google sign-in from https://gradr.me/auth for both an
 * *existing* and a *new* test account, records every redirect hop, and FAILS
 * (non-zero exit) if:
 *   - the redirect_uri sent to Google is not https://gradr.me/auth
 *   - any hop resolves to a domain outside the allow-list
 *   - the final landing URL is not https://gradr.me/auth
 *   - /auth or an OAuth path is missing CSP / HSTS / Referrer-Policy
 *
 * Results are posted to /api/public/oauth-forensics (action: "ingest") so the
 * admin console and the incident-timeline export can cite them.
 *
 * Env:
 *   GRADR_ORIGIN              default https://gradr.me
 *   OAUTH_EXISTING_EMAIL/PASSWORD   Google account already linked to Gradr
 *   OAUTH_NEW_EMAIL/PASSWORD        Google account not yet linked
 *   CRON_SECRET               shared key for the ingest endpoint
 */
import { chromium } from "playwright";

const ORIGIN = process.env.GRADR_ORIGIN ?? "https://gradr.me";
const EXPECTED_FINAL_URL = `${ORIGIN}/auth`;
const EXPECTED_REDIRECT_URI = `${ORIGIN}/auth`;

const ALLOWED_HOSTS = [
  /(^|\.)gradr\.me$/i,
  /(^|\.)google\.com$/i,
  /(^|\.)gstatic\.com$/i,
  /(^|\.)googleusercontent\.com$/i,
  /(^|\.)supabase\.co$/i,
  /(^|\.)lovable\.app$/i,
];

const REQUIRED_HEADERS = ["content-security-policy", "strict-transport-security", "referrer-policy"];
const HEADER_PATHS = ["/auth", "/auth?mode=signup", "/.lovable/oauth/consent"];

const redact = (url) => url.replace(/([?&#](code|access_token|id_token|refresh_token)=)[^&#]*/gi, "$1[redacted]");

async function checkHeaders() {
  const results = [];
  for (const path of HEADER_PATHS) {
    const url = `${ORIGIN}${path}`;
    try {
      const response = await fetch(url, { redirect: "manual" });
      const problems = REQUIRED_HEADERS.filter((h) => !response.headers.get(h)).map(
        (h) => `${path}: missing ${h}`,
      );
      results.push({
        path,
        status: response.status,
        ok: problems.length === 0,
        problems,
        headers: Object.fromEntries(REQUIRED_HEADERS.map((h) => [h, response.headers.get(h)])),
      });
    } catch (error) {
      results.push({ path, status: null, ok: false, problems: [`${path}: ${error.message}`], headers: {} });
    }
  }
  return results;
}

async function runAccount({ label, email, password }) {
  const started = Date.now();
  const failures = [];
  const hops = [];
  const consoleErrors = [];
  let redirectUri = null;

  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const page = await context.newPage();

  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text().slice(0, 300));
  });

  page.on("framenavigated", (frame) => {
    if (frame !== page.mainFrame()) return;
    const url = redact(frame.url());
    if (hops.at(-1)?.url === url) return;
    hops.push({ order: hops.length, url, kind: "navigation", at: new Date().toISOString() });
    try {
      const parsed = new URL(url);
      if (parsed.searchParams.has("redirect_uri") && !redirectUri) {
        redirectUri = parsed.searchParams.get("redirect_uri");
      }
      if (!ALLOWED_HOSTS.some((re) => re.test(parsed.host))) {
        failures.push(`Redirect hop resolved to unexpected host: ${parsed.host}`);
      }
    } catch {
      failures.push(`Unparseable redirect hop: ${url}`);
    }
  });

  try {
    await page.goto(`${ORIGIN}/auth`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.getByRole("button", { name: /google/i }).first().click();

    await page.waitForURL(/accounts\.google\.com/, { timeout: 45_000 });
    await page.fill('input[type="email"]', email);
    await page.getByRole("button", { name: /next/i }).click();
    await page.waitForSelector('input[type="password"]', { timeout: 45_000 });
    await page.fill('input[type="password"]', password);
    await page.getByRole("button", { name: /next/i }).click();

    const consent = page.getByRole("button", { name: /continue|allow/i }).first();
    await consent.click({ timeout: 15_000 }).catch(() => {});

    await page.waitForURL(new RegExp(`^${ORIGIN.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/`), {
      timeout: 60_000,
    });
    await page.waitForLoadState("networkidle").catch(() => {});
  } catch (error) {
    failures.push(`Flow error: ${error.message.split("\n")[0]}`);
  }

  const finalUrl = redact(page.url());
  let finalDomain = "unknown";
  try {
    finalDomain = new URL(finalUrl).host;
  } catch {
    /* keep unknown */
  }

  if (redirectUri && !redirectUri.startsWith(EXPECTED_REDIRECT_URI)) {
    failures.push(`redirect_uri deviated: expected ${EXPECTED_REDIRECT_URI}, got ${redirectUri}`);
  }
  if (!finalUrl.startsWith(EXPECTED_FINAL_URL)) {
    failures.push(`Final URL deviated: expected ${EXPECTED_FINAL_URL}, got ${finalUrl}`);
  }

  await browser.close();

  return {
    accountLabel: label,
    status: failures.length === 0 ? "pass" : "fail",
    redirectUri,
    finalUrl,
    finalDomain,
    expectedFinalUrl: EXPECTED_FINAL_URL,
    durationMs: Date.now() - started,
    hops,
    failures,
    consoleErrors,
  };
}

async function main() {
  const headerChecks = await checkHeaders();
  const headerFailures = headerChecks.flatMap((c) => c.problems);

  const accounts = [
    { label: "existing", email: process.env.OAUTH_EXISTING_EMAIL, password: process.env.OAUTH_EXISTING_PASSWORD },
    { label: "new", email: process.env.OAUTH_NEW_EMAIL, password: process.env.OAUTH_NEW_PASSWORD },
  ].filter((account) => account.email && account.password);

  if (accounts.length === 0) {
    console.error("No OAuth test accounts configured (OAUTH_EXISTING_* / OAUTH_NEW_*).");
    process.exit(2);
  }

  const results = [];
  for (const account of accounts) {
    const result = await runAccount(account);
    result.headerChecks = headerChecks;
    if (headerFailures.length) {
      result.failures = [...result.failures, ...headerFailures];
      result.status = "fail";
    }
    results.push(result);
    console.log(
      `[${result.accountLabel}] ${result.status} — final ${result.finalUrl} (${result.hops.length} hops)`,
    );
    for (const failure of result.failures) console.error(`  ✗ ${failure}`);
  }

  const runId = `oauth-check-${new Date().toISOString()}`;
  if (process.env.CRON_SECRET) {
    try {
      const response = await fetch(`${ORIGIN}/api/public/oauth-forensics`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-cron-secret": process.env.CRON_SECRET },
        body: JSON.stringify({ action: "ingest", runId, source: "ci", results }),
      });
      console.log(`Ingest: HTTP ${response.status}`);
    } catch (error) {
      console.error(`Ingest failed: ${error.message}`);
    }
  } else {
    console.warn("CRON_SECRET not set — results were not ingested.");
  }

  const failed = results.filter((r) => r.status !== "pass");
  if (failed.length) {
    console.error(`\n${failed.length} of ${results.length} OAuth flow checks FAILED.`);
    process.exit(1);
  }
  console.log(`\nAll ${results.length} OAuth flow checks passed.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
