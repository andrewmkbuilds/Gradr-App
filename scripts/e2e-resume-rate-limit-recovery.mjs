#!/usr/bin/env node
/**
 * Rate-limit recovery: throttled -> countdown -> automatic replay -> results.
 *
 * The first `analyze-resume` call is answered with the real 429 shape
 * (`code: "rate_limited"`, `retry_after_ms`, `x-request-id`) and a deliberately
 * short window; every later call streams a normal successful analysis. That
 * proves the whole loop without waiting a real 60s:
 *
 *   1. the UI shows the rate-limit notice with a visible countdown and the
 *      server's request id (not a generic failure),
 *   2. no user click happens — the hook replays the queued request itself
 *      once `retry_after_ms` elapses,
 *   3. the UI leaves the rate-limited state and renders the analysis results.
 *
 * Usage: node scripts/e2e-resume-rate-limit-recovery.mjs [baseUrl]
 * Skips cleanly when E2E_EMAIL / E2E_PASSWORD are missing.
 */
import { mkdirSync } from "node:fs";
import { launchBrowser } from "./lib/browser.mjs";

const BASE = (process.argv[2] || process.env.E2E_BASE_URL || "http://localhost:8080").replace(/\/$/, "");
const EMAIL = process.env.E2E_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD;

if (!EMAIL || !PASSWORD) {
  console.log("SKIP  rate-limit recovery e2e — E2E_EMAIL / E2E_PASSWORD not set.");
  process.exit(0);
}

const SHOTS = "tests/reports/screenshots/rate-limit-recovery";
mkdirSync(SHOTS, { recursive: true });

const results = [];
const record = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

const RETRY_AFTER_MS = 4000;
const REQUEST_ID = "analyze-resume-e2e-throttle";

const ANALYSIS = {
  ats_score: 82,
  keyword_match: 74,
  formatting_score: 88,
  impact_score: 79,
  readability_score: 85,
  suggestions: [{ title: "Quantify your impact", detail: "Add numbers to three bullets.", severity: "medium" }],
};

const sse = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

let calls = 0;
const callTimes = [];

async function installMocks(context) {
  await context.route("**/functions/v1/analyze-resume", async (route) => {
    calls += 1;
    callTimes.push(Date.now());
    if (calls === 1) {
      await route.fulfill({
        status: 429,
        contentType: "application/json",
        headers: {
          "access-control-allow-origin": "*",
          "access-control-expose-headers": "x-request-id, Retry-After",
          "x-request-id": REQUEST_ID,
          "retry-after": String(Math.ceil(RETRY_AFTER_MS / 1000)),
        },
        body: JSON.stringify({
          error: `Rate limit exceeded. Try again in ${Math.ceil(RETRY_AFTER_MS / 1000)}s.`,
          code: "rate_limited",
          retry_after: Math.ceil(RETRY_AFTER_MS / 1000),
          retry_after_ms: RETRY_AFTER_MS,
          request_id: REQUEST_ID,
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      headers: { "access-control-allow-origin": "*" },
      body:
        sse("stage", { key: "parsing", label: "Parsing your resume", progress: 0.3 }) +
        sse("partial", ANALYSIS) +
        sse("result", ANALYSIS) +
        sse("done", {}),
    });
  });
}

async function signIn(page) {
  await page.goto(`${BASE}/auth`, { waitUntil: "domcontentloaded" });
  await page.getByLabel(/email/i).first().fill(EMAIL);
  await page.getByLabel(/password/i).first().fill(PASSWORD);
  await page.getByRole("button", { name: /sign in|log in/i }).first().click();
  await page.waitForURL((url) => !url.pathname.startsWith("/auth"), { timeout: 30_000 });
}

const visible = (locator) => locator.isVisible().catch(() => false);

const browser = await launchBrowser();
const context = await browser.newContext({ viewport: { width: 1280, height: 1600 } });
try {
  await installMocks(context);
  const page = await context.newPage();
  await signIn(page);
  await page.goto(`${BASE}/resume`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);

  // Upload a small text resume — enough to trigger analysis.
  await page.setInputFiles('input[type="file"]', {
    name: "resume.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(
      "Jane Doe\nSenior Engineer\nBuilt and shipped payment systems. Led a team of 5. Reduced latency 40%.\n",
    ),
  });

  const notice = page.getByTestId("rate-limit-notice");
  await notice.waitFor({ state: "visible", timeout: 30_000 });
  record("throttled call shows the rate-limit notice", true);

  const noticeText = await notice.innerText();
  record("notice states an estimated wait", /\d+s/.test(noticeText), noticeText.replace(/\s+/g, " ").slice(0, 120));
  record(
    "notice carries the server request id",
    (await visible(page.getByTestId("rate-limit-request-id"))) && noticeText.includes(REQUEST_ID),
    REQUEST_ID,
  );

  // No clicking: the hook must replay by itself once the window elapses.
  await page.waitForTimeout(RETRY_AFTER_MS + 1500);
  record("request auto-replayed after retry_after_ms", calls >= 2, `${calls} calls`);
  if (callTimes.length >= 2) {
    const gap = callTimes[1] - callTimes[0];
    record(
      "replay waited for the full retry window",
      gap >= RETRY_AFTER_MS - 750,
      `${gap}ms gap (window ${RETRY_AFTER_MS}ms)`,
    );
  }

  await page.waitForTimeout(1500);
  record("rate-limit notice cleared", !(await visible(notice)));
  record(
    "results rendered after recovery",
    await visible(page.getByText(String(ANALYSIS.ats_score)).first()),
    `ats_score ${ANALYSIS.ats_score}`,
  );
  await page.screenshot({ path: `${SHOTS}/1-recovered.png` });
} finally {
  await context.close();
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed. Screenshots in ${SHOTS}/`);
if (failed.length) process.exit(1);
