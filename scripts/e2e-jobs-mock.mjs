#!/usr/bin/env node
/**
 * `/jobs` UI contract test against a mocked job-search backend.
 *
 * The real search hits Adzuna, which is unavailable (and non-deterministic) in
 * CI. Here every `search-jobs` call is intercepted at the network layer and
 * answered with a fixture, so the assertions are about the UI only:
 *
 *   1. the page starts in the "No listings yet" empty state,
 *   2. a search renders one card per returned listing, with company/salary,
 *   3. requesting a second page returns the next slice (the function's
 *      pagination contract — the feed itself renders one page at a time),
 *   4. a search that returns nothing falls back to the empty state again.
 *
 * Usage: node scripts/e2e-jobs-mock.mjs [baseUrl]
 * Skips cleanly when E2E_EMAIL / E2E_PASSWORD are missing.
 */
import { mkdirSync } from "node:fs";
import { launchBrowser } from "./lib/browser.mjs";

const BASE = (process.argv[2] || process.env.E2E_BASE_URL || "http://localhost:8080").replace(/\/$/, "");
const EMAIL = process.env.E2E_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD;

if (!EMAIL || !PASSWORD) {
  console.log("SKIP  jobs mock e2e — E2E_EMAIL / E2E_PASSWORD not set.");
  process.exit(0);
}

const SHOTS = "tests/reports/screenshots/jobs-mock";
mkdirSync(SHOTS, { recursive: true });

const results = [];
const record = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

const PER_PAGE = 6;
const TOTAL = 14;

function fixtureJobs(page) {
  const start = (page - 1) * PER_PAGE;
  const count = Math.max(0, Math.min(PER_PAGE, TOTAL - start));
  return Array.from({ length: count }, (_, i) => {
    const n = start + i + 1;
    return {
      external_id: `mock-${n}`,
      source: "adzuna",
      title: `Mock Engineer ${n}`,
      company: `Mockworks ${n}`,
      location: "Remote",
      remote: true,
      url: `https://example.com/mock-job/${n}`,
      salary_min: 100000 + n * 1000,
      salary_max: 150000 + n * 1000,
      description: `Mocked Adzuna listing ${n}.`,
      posted_at: new Date(Date.now() - n * 3_600_000).toISOString(),
    };
  });
}

/** State the interceptor answers with; flipped between assertions. */
let mode = "page1";

async function installMocks(context) {
  await context.route("**/functions/v1/search-jobs", async (route) => {
    const page = mode === "page2" ? 2 : 1;
    const jobs = mode === "empty" ? [] : fixtureJobs(page);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify({ jobs, total: mode === "empty" ? 0 : TOTAL, page, sources: { adzuna: { count: jobs.length, status: "ok" } } }),
    });
  });
  // Keep scoring and scraping out of the picture — this test is about the feed.
  for (const fn of ["recommend-jobs", "jobs-apify", "match-jobs"]) {
    await context.route(`**/functions/v1/${fn}`, (route) =>
      route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ jobs: [], scores: [] }) }),
    );
  }
}

async function signIn(page) {
  await page.goto(`${BASE}/auth`, { waitUntil: "domcontentloaded" });
  await page.getByLabel(/email/i).first().fill(EMAIL);
  await page.getByLabel(/password/i).first().fill(PASSWORD);
  await page.getByRole("button", { name: /sign in|log in/i }).first().click();
  await page.waitForURL((url) => !url.pathname.startsWith("/auth"), { timeout: 30_000 });
}

const cardCount = (page) => page.locator("h3", { hasText: /^Mock Engineer \d+$/ }).count();

async function runSearch(page) {
  await page.getByRole("button", { name: /^search jobs$/i }).first().click();
  await page.waitForTimeout(1500);
}

const browser = await launchBrowser();
const context = await browser.newContext({ viewport: { width: 1280, height: 1400 } });
try {
  await installMocks(context);
  const page = await context.newPage();
  await signIn(page);

  await page.goto(`${BASE}/jobs`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  record("empty state on first load", await page.getByText(/no listings yet/i).isVisible().catch(() => false));
  await page.screenshot({ path: `${SHOTS}/1-empty.png` });

  // --- page 1 -------------------------------------------------------------
  mode = "page1";
  await page.getByLabel(/job title or keywords/i).first().fill("engineer");
  await runSearch(page);
  const first = await cardCount(page);
  record("renders one card per mocked listing", first === PER_PAGE, `${first} cards (expected ${PER_PAGE})`);
  record(
    "card shows company and salary",
    (await page.getByText("Mockworks 1").first().isVisible().catch(() => false)) &&
      (await page.getByText(/\$101k/).first().isVisible().catch(() => false)),
  );
  record("empty state hidden with results", !(await page.getByText(/no listings yet/i).isVisible().catch(() => false)));
  await page.screenshot({ path: `${SHOTS}/2-results.png` });

  // --- page 2 (next slice of the same result set) -------------------------
  mode = "page2";
  await runSearch(page);
  const second = await cardCount(page);
  const hasNextSlice = await page.getByText("Mock Engineer 7").first().isVisible().catch(() => false);
  record("second page returns the next slice", second > 0 && hasNextSlice, `${second} cards, "Mock Engineer 7" ${hasNextSlice ? "visible" : "missing"}`);
  await page.screenshot({ path: `${SHOTS}/3-page2.png` });

  // --- back to empty ------------------------------------------------------
  mode = "empty";
  await runSearch(page);
  const backToEmpty = await page.getByText(/no listings yet/i).isVisible().catch(() => false);
  record("returns to empty state when a search yields nothing", backToEmpty && (await cardCount(page)) === 0);
  await page.screenshot({ path: `${SHOTS}/4-empty-again.png` });
} finally {
  await context.close();
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed. Screenshots in ${SHOTS}/`);
if (failed.length) process.exit(1);
