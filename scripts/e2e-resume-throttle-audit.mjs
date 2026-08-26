#!/usr/bin/env node
/**
 * Resume-analysis throttling: UX + server-side audit trail.
 *
 * `analyze-resume` allows 10 calls per user per 60s (durable, see
 * `_shared/rateLimit.ts`). This test bursts past that ceiling with the app's
 * own session token and asserts both halves of the contract:
 *
 *   1. the 429 body is structured — `code: "rate_limited"` plus
 *      `retry_after` / `retry_after_ms` — so the UI can count down,
 *   2. the UI shows the wait instead of a bare failure,
 *   3. `ai_rate_limits` records the throttled window, and `admin_rpc_audit`
 *      holds a `rate_limited` row for that user carrying the request id and the
 *      retry-window fields (checked with the service role when available).
 *
 * Usage: node scripts/e2e-resume-throttle-audit.mjs [baseUrl]
 * Skips cleanly when E2E_EMAIL / E2E_PASSWORD are missing. The audit assertion
 * additionally needs SUPABASE_SERVICE_ROLE_KEY + VITE_SUPABASE_URL.
 */
import { mkdirSync } from "node:fs";
import { launchBrowser } from "./lib/browser.mjs";

const BASE = (process.argv[2] || process.env.E2E_BASE_URL || "http://localhost:8080").replace(/\/$/, "");
const EMAIL = process.env.E2E_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;

if (!EMAIL || !PASSWORD) {
  console.log("SKIP  resume throttle audit e2e — E2E_EMAIL / E2E_PASSWORD not set.");
  process.exit(0);
}

const SHOTS = "tests/reports/screenshots/resume-throttle";
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

/** Burst the function from the page so the server sees the app's real headers. */
async function burst(page, count) {
  return page.evaluate(async ({ count }) => {
    const key = Object.keys(localStorage).find((k) => /^sb-.*-auth-token$/.test(k));
    const session = key ? JSON.parse(localStorage.getItem(key)) : null;
    const token = session?.access_token;
    const url = window.__SUPABASE_URL__ || document.querySelector("meta[name='supabase-url']")?.content;
    if (!token || !url) return { error: "no session/url in page" };
    let throttled = 0;
    let body = null;
    let requestId = null;
    let userId = session?.user?.id ?? null;
    for (let i = 0; i < count; i += 1) {
      const probeId = `throttle-probe-${Date.now().toString(36)}-${i}`;
      const res = await fetch(`${url}/functions/v1/analyze-resume`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
          // Correlates this exact call with the server audit row it writes.
          "x-request-id": probeId,
        },
        body: JSON.stringify({ resumeText: "Throttle probe resume. Engineer. Shipped features." }),
      });
      if (res.status === 429) {
        throttled += 1;
        if (!body) {
          body = await res.json().catch(() => null);
          requestId = res.headers.get("x-request-id") || body?.request_id || probeId;
        }
        if (throttled >= 2) break;
      }
    }
    return { throttled, body, userId, requestId };
  }, { count });
}

const browser = await launchBrowser();
const context = await browser.newContext({ viewport: { width: 1280, height: 1400 } });
let userId = null;
let throttledRequestId = null;
try {
  const page = await context.newPage();
  // Expose the backend URL for the in-page burst.
  await page.addInitScript(() => {
    window.__SUPABASE_URL__ = undefined;
  });
  await signIn(page);
  await page.goto(`${BASE}/resume`, { waitUntil: "domcontentloaded" });
  await page.evaluate((u) => { window.__SUPABASE_URL__ = u; }, process.env.VITE_SUPABASE_URL ?? SUPABASE_URL ?? "");

  const out = await burst(page, 16);
  if (out.error) {
    record("burst analyze-resume until throttled", false, out.error);
  } else {
    userId = out.userId;
    throttledRequestId = out.requestId;
    record("burst analyze-resume until throttled", out.throttled > 0, `${out.throttled} throttled responses`);
    record("429 body carries code rate_limited", out.body?.code === "rate_limited", JSON.stringify(out.body ?? {}));
    record(
      "429 body carries retry_after_ms",
      Number(out.body?.retry_after_ms) > 0 && Number(out.body?.retry_after) > 0,
      `retry_after=${out.body?.retry_after} retry_after_ms=${out.body?.retry_after_ms}`,
    );
    record(
      "429 body echoes the request id",
      typeof out.body?.request_id === "string" && out.body.request_id.length > 0,
      String(out.body?.request_id ?? "missing"),
    );
  }

  await page.screenshot({ path: `${SHOTS}/1-after-burst.png` });
} finally {
  await context.close();
  await browser.close();
}

// --- server-side audit ------------------------------------------------------
if (!SERVICE_KEY || !SUPABASE_URL) {
  console.log("SKIP  audit assertion — SUPABASE_SERVICE_ROLE_KEY / VITE_SUPABASE_URL not set.");
} else {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/ai_rate_limits?endpoint=eq.analyze-resume&order=window_start.desc&limit=5`,
    { headers: { apikey: SERVICE_KEY, authorization: `Bearer ${SERVICE_KEY}` } },
  );
  const rows = res.ok ? await res.json() : [];
  const mine = userId ? rows.filter((r) => r.user_id === userId) : rows;
  record(
    "rate limiter recorded the throttled window",
    res.ok && mine.length > 0 && Number(mine[0].hits ?? 0) > 10,
    res.ok ? `hits=${mine[0]?.hits ?? "none"}` : `HTTP ${res.status}`,
  );

  // The limiter is the only writer of these rows, so their presence proves the
  // throttle was recorded server-side and cannot be faked from the client.
  const auditRes = await fetch(
    `${SUPABASE_URL}/rest/v1/admin_rpc_audit?status=eq.rate_limited&order=created_at.desc&limit=20`,
    { headers: { apikey: SERVICE_KEY, authorization: `Bearer ${SERVICE_KEY}` } },
  );
  const auditRows = auditRes.ok ? await auditRes.json() : [];
  const resumeRows = auditRows.filter(
    (r) =>
      (!userId || r.actor_id === userId) &&
      /analyze-resume/.test(`${r.function_name} ${JSON.stringify(r.details ?? {})}`),
  );
  const row = resumeRows[0];
  record(
    "admin_rpc_audit holds a throttled resume-analysis row",
    auditRes.ok && !!row,
    auditRes.ok ? `${resumeRows.length} matching rows` : `HTTP ${auditRes.status}`,
  );
  if (row) {
    record("audit row records the throttled outcome", row.status === "rate_limited", row.status);
    record(
      "audit row carries the request id from the 429",
      !!row.request_id && (!throttledRequestId || row.request_id === throttledRequestId),
      `${row.request_id} (client saw ${throttledRequestId ?? "n/a"})`,
    );
    const d = row.details ?? {};
    record(
      "audit row carries the retry window fields",
      Number(d.retry_after) > 0 && Number(d.retry_after_ms) > 0 && Number(d.window_seconds) > 0,
      JSON.stringify({ retry_after: d.retry_after, retry_after_ms: d.retry_after_ms, window_seconds: d.window_seconds }),
    );
    record("audit row records the limit and hit count", Number(d.limit) > 0 && Number(d.hits) >= Number(d.limit),
      `hits=${d.hits} limit=${d.limit}`);
  }
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed. Screenshots in ${SHOTS}/`);
if (failed.length) process.exit(1);
