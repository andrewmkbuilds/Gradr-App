#!/usr/bin/env node
/**
 * Admin RPC throttling end-to-end check.
 *
 * `public.admin_rpc_guard()` allows 120 successful calls per function per
 * minute per actor and rejects the rest. This test drives a real signed-in
 * admin browser session, bursts past that ceiling from inside the page (so the
 * calls carry the app's own auth + `x-request-id` headers), and asserts:
 *
 *   1. the burst starts succeeding and then flips to a throttle error,
 *   2. the throttle error message is the guard's, not a generic failure,
 *   3. `admin_rpc_audit` records the rejected calls with status `rate_limited`,
 *   4. the audit log UI surfaces those rows under the "Throttled" filter.
 *
 * Usage: node scripts/e2e-admin-rpc-throttle.mjs [baseUrl]
 * Skips cleanly when ADMIN_E2E_EMAIL / ADMIN_E2E_PASSWORD are missing.
 * See docs/admin-rpc-security.md.
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.argv[2] || process.env.E2E_BASE_URL || "http://localhost:8080";
const EMAIL = process.env.ADMIN_E2E_EMAIL;
const PASSWORD = process.env.ADMIN_E2E_PASSWORD;

if (!EMAIL || !PASSWORD) {
  console.log("SKIP  admin rpc throttle e2e — ADMIN_E2E_EMAIL / ADMIN_E2E_PASSWORD not set.");
  process.exit(0);
}

/** Read-only RPC: bursting it cannot mutate anything. */
const TARGET_FN = "admin_audit_actors";
const BURST = 150; // guard limit is 120/min
const SHOTS = "tests/reports/screenshots/admin-rpc-throttle";
mkdirSync(SHOTS, { recursive: true });

const results = [];
const record = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

async function signIn(page) {
  await page.goto(`${BASE}/auth`, { waitUntil: "domcontentloaded" });
  await page.getByLabel(/email/i).first().fill(EMAIL);
  await page.getByLabel(/password/i).first().fill(PASSWORD);
  await page.getByRole("button", { name: /sign in|log in/i }).first().click();
  await page.waitForURL((url) => !url.pathname.startsWith("/auth"), { timeout: 30_000 });
}

/**
 * Burst the RPC from the page context using the app's own Supabase session
 * token, so the server sees exactly what the UI would send.
 */
async function burst(page, fn, count) {
  return page.evaluate(
    async ({ fn, count }) => {
      const url = import.meta?.env?.VITE_SUPABASE_URL || window.__SUPABASE_URL__;
      // Recover the session from the client's localStorage entry.
      const key = Object.keys(localStorage).find((k) => /^sb-.*-auth-token$/.test(k));
      const session = key ? JSON.parse(localStorage.getItem(key)) : null;
      const token = session?.access_token;
      const apikey = window.__SUPABASE_KEY__;
      if (!url || !token || !apikey) return { error: "no session/url available in page" };

      let ok = 0;
      let throttled = 0;
      let firstThrottleMessage = "";
      const requestIds = [];

      for (let i = 0; i < count; i += 1) {
        const requestId = `throttle-e2e-${Date.now()}-${i}`;
        requestIds.push(requestId);
        const res = await fetch(`${url}/rest/v1/rpc/${fn}`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            apikey,
            authorization: `Bearer ${token}`,
            "x-request-id": requestId,
          },
          body: "{}",
        });
        if (res.ok) {
          ok += 1;
        } else {
          const body = await res.text();
          if (/rate limit|too many/i.test(body)) {
            throttled += 1;
            if (!firstThrottleMessage) firstThrottleMessage = body.slice(0, 200);
          }
        }
      }
      return { ok, throttled, firstThrottleMessage, requestIds };
    },
    { fn, count },
  );
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 1400 } });
  const page = await context.newPage();

  try {
    await signIn(page);
    record("admin can sign in", true);
  } catch (err) {
    record("admin can sign in", false, err.message);
    await browser.close();
    process.exit(1);
  }

  // The audit page exposes the Supabase URL/key the app itself uses.
  await page.goto(`${BASE}/admin/audit-log`, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    // Expose the configured values the bundled client already holds.
    window.__SUPABASE_URL__ = import.meta?.env?.VITE_SUPABASE_URL;
    window.__SUPABASE_KEY__ = import.meta?.env?.VITE_SUPABASE_PUBLISHABLE_KEY;
  });

  const result = await burst(page, TARGET_FN, BURST);

  if (result.error) {
    record("burst can reach the RPC", false, result.error);
    await browser.close();
    process.exit(1);
  }

  record("burst produced successful calls", result.ok > 0, `${result.ok} allowed`);
  record(
    "burst was throttled past the limit",
    result.throttled > 0,
    `${result.throttled} rejected`,
  );
  record(
    "throttle error names the rate limit",
    /rate limit/i.test(result.firstThrottleMessage || ""),
    result.firstThrottleMessage,
  );

  // The UI should show the throttled rows under the Throttled outcome filter.
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    window.__SUPABASE_URL__ = import.meta?.env?.VITE_SUPABASE_URL;
    window.__SUPABASE_KEY__ = import.meta?.env?.VITE_SUPABASE_PUBLISHABLE_KEY;
  });
  await page.waitForTimeout(2500);
  await page.getByLabel(/filter by outcome/i).selectOption("rate_limited");
  await page.waitForTimeout(2500);
  const throttledBadges = await page.getByText(/^Throttled$/).count();
  record("audit log UI lists throttled calls", throttledBadges > 0, `${throttledBadges} rows`);

  await page.screenshot({ path: `${SHOTS}/throttled-audit.png` });

  // --- request id parity -------------------------------------------------
  // Exhaust the retention-settings RPC, then reload: the retention card's own
  // read is throttled and renders the error with its request id. That id must
  // be the one the server wrote onto the `rate_limited` audit row.
  const parity = await burst(page, "admin_rpc_audit_retention_settings", BURST);
  record(
    "retention settings RPC can be throttled",
    parity.throttled > 0,
    `${parity.throttled} rejected`,
  );

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    window.__SUPABASE_URL__ = import.meta?.env?.VITE_SUPABASE_URL;
    window.__SUPABASE_KEY__ = import.meta?.env?.VITE_SUPABASE_PUBLISHABLE_KEY;
  });
  const errorBox = page.getByTestId("retention-error");
  let uiRequestId = null;
  try {
    await errorBox.waitFor({ state: "visible", timeout: 20_000 });
    const text = (await errorBox.textContent()) || "";
    record("UI shows the throttle error", /throttl|too many/i.test(text), text.slice(0, 160));
    uiRequestId = (/request id:\s*([\w-]+)/i.exec(text) || [])[1] || null;
    record("throttle error carries a request id", Boolean(uiRequestId), uiRequestId || "none");
  } catch (err) {
    record("UI shows the throttle error", false, err.message);
  }

  await page.screenshot({ path: `${SHOTS}/throttle-request-id.png` });

  if (uiRequestId) {
    // Give the guard's audit write a moment, then look the id up server-side.
    await page.waitForTimeout(2000);
    const audited = await page.evaluate(async (requestId) => {
      const url = window.__SUPABASE_URL__;
      const apikey = window.__SUPABASE_KEY__;
      const key = Object.keys(localStorage).find((k) => /^sb-.*-auth-token$/.test(k));
      const token = key ? JSON.parse(localStorage.getItem(key))?.access_token : null;
      const res = await fetch(
        `${url}/rest/v1/admin_rpc_audit?select=request_id,status,function_name&request_id=eq.${encodeURIComponent(requestId)}`,
        { headers: { apikey, authorization: `Bearer ${token}` } },
      );
      return res.ok ? await res.json() : { error: await res.text() };
    }, uiRequestId);

    const rows = Array.isArray(audited) ? audited : [];
    record(
      "audit log holds a row for the request id shown in the UI",
      rows.length > 0,
      `${rows.length} rows`,
    );
    record(
      "that audit row is recorded as throttled",
      rows.some((r) => r.status === "rate_limited"),
      rows.map((r) => r.status).join(", ") || JSON.stringify(audited).slice(0, 160),
    );
  }

  await browser.close();

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} throttle checks passed.`);
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
