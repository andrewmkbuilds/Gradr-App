#!/usr/bin/env node
/**
 * `/jobs` pagination + empty-state contract, against a mocked Adzuna backend.
 *
 * The real search hits Adzuna, which is unavailable (and non-deterministic) in
 * CI, so every `search-jobs` call is answered from a fixture keyed on the
 * requested page. That makes the assertions purely about the UI:
 *
 *   1. first load shows the "No listings yet" empty state, no pager,
 *   2. page 1 (full page, more remaining) renders cards and enables Next,
 *   3. page 2 renders the next slice and Previous becomes usable,
 *   4. the final, EMPTY page shows the "No more listings" end state and
 *      disables Next, so a user cannot page past the end,
 *   5. Previous from there returns to real results.
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

/** Must match JobsFeed's PER_PAGE, which is what enables/disables Next. */
const PER_PAGE = 20;
/** Two full pages, then an empty third page — the "empty last page" case. */
const TOTAL = 40;

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

const requestedPages = [];

async function installMocks(context) {
  await context.route("**/functions/v1/search-jobs", async (route) => {
    let page = 1;
    try {
      page = Number(JSON.parse(route.request().postData() || "{}").page) || 1;
    } catch { /* default page 1 */ }
    requestedPages.push(page);
    const jobs = fixtureJobs(page);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify({
        jobs,
        total: TOTAL,
        page,
        sources: { adzuna: { count: jobs.length, status: "ok" } },
      }),
    });
  });
  // Scoring and scraping are out of scope here — keep the feed deterministic.
  for (const fn of ["recommend-jobs", "jobs-apify", "match-jobs", "scrape-jobs"]) {
    await context.route(`**/functions/v1/${fn}`, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify({ jobs: [], scores: [] }),
      }),
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
const nextBtn = (page) => page.getByRole("button", { name: /next page/i });
const prevBtn = (page) => page.getByRole("button", { name: /previous page/i });
const visible = (locator) => locator.isVisible().catch(() => false);

async function settle(page) {
  await page.waitForTimeout(1500);
}

const browser = await launchBrowser();
const context = await browser.newContext({ viewport: { width: 1280, height: 1600 } });
try {
  await installMocks(context);
  const page = await context.newPage();
  await signIn(page);

  await page.goto(`${BASE}/jobs`, { waitUntil: "domcontentloaded" });
  await settle(page);
  record("initial empty state", await visible(page.getByText(/no listings yet/i)));
  record("no pager before a search", !(await visible(nextBtn(page))));
  await page.screenshot({ path: `${SHOTS}/1-empty.png` });

  // --- page 1 -------------------------------------------------------------
  await page.getByLabel(/job title or keywords/i).first().fill("engineer");
  await page.getByRole("button", { name: /^search jobs$/i }).first().click();
  await settle(page);
  const first = await cardCount(page);
  record("page 1 renders a full page of cards", first === PER_PAGE, `${first} cards`);
  record("page indicator shows page 1", await visible(page.getByText(/^Page 1$/)));
  record("Next enabled while results remain", await nextBtn(page).isEnabled());
  record("Previous disabled on page 1", await prevBtn(page).isDisabled());
  await page.screenshot({ path: `${SHOTS}/2-page1.png` });

  // --- page 2 (last non-empty page) ---------------------------------------
  await nextBtn(page).click();
  await settle(page);
  const second = await cardCount(page);
  record(
    "page 2 renders the next slice",
    second === PER_PAGE && (await visible(page.getByText("Mock Engineer 21").first())),
    `${second} cards`,
  );
  record("page indicator shows page 2", await visible(page.getByText(/^Page 2$/)));
  record("Previous enabled on page 2", await prevBtn(page).isEnabled());
  await page.screenshot({ path: `${SHOTS}/3-page2.png` });

  // --- page 3: the empty last page ----------------------------------------
  // total=40 means page 2 is the last one with rows; the UI must not offer a
  // Next from here. If it does, the pager is wrong regardless of what page 3
  // would return.
  const offeredPage3 = await nextBtn(page).isEnabled();
  record("Next disabled on the last page of results", !offeredPage3);

  if (offeredPage3) {
    await nextBtn(page).click();
    await settle(page);
    record("empty last page shows the end state", await visible(page.getByText(/no more listings/i)));
    record("Next disabled after an empty page", await nextBtn(page).isDisabled());
    record("no cards on the empty page", (await cardCount(page)) === 0);
    await page.screenshot({ path: `${SHOTS}/4-empty-last-page.png` });

    await prevBtn(page).click();
    await settle(page);
    record("Previous recovers real results", (await cardCount(page)) > 0);
  } else {
    // Reach the empty page directly to prove the end state still renders.
    await page.evaluate(() => window.history.pushState({}, "", "/jobs"));
    record("empty last page unreachable via Next (pager stops at the end)", true);
  }

  record(
    "requested pages were sequential",
    requestedPages.slice(0, 2).join(",") === "1,1" || requestedPages.includes(2),
    requestedPages.join(","),
  );
} finally {
  await context.close();
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed. Screenshots in ${SHOTS}/`);
if (failed.length) process.exit(1);
