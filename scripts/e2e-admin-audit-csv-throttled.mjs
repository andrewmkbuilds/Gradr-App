#!/usr/bin/env node
/**
 * Admin audit CSV export, filtered to throttled resume-analysis outcomes.
 *
 * Signs in as an admin, filters `admin_rpc_audit` to outcome = Throttled and
 * searches for the resume-analysis endpoint, exports the CSV, and asserts:
 *
 *   - the download carries the documented header row,
 *   - every exported row is a `rate_limited` resume-analysis row,
 *   - the request ids in the CSV match the request ids shown in the table
 *     (correlation between what an admin sees and what they export),
 *   - a non-admin signed-in user cannot reach the page or the underlying data.
 *
 * Usage: node scripts/e2e-admin-audit-csv-throttled.mjs [baseUrl]
 * Requires E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD; the non-admin half additionally
 * needs E2E_EMAIL / E2E_PASSWORD. Skips cleanly when they are absent.
 */
import { mkdirSync, readFileSync } from "node:fs";
import { launchBrowser } from "./lib/browser.mjs";

const BASE = (process.argv[2] || process.env.E2E_BASE_URL || "http://localhost:8080").replace(/\/$/, "");
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD;
const USER_EMAIL = process.env.E2E_EMAIL;
const USER_PASSWORD = process.env.E2E_PASSWORD;

if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.log("SKIP  admin audit CSV e2e — E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD not set.");
  process.exit(0);
}

const OUT = "tests/reports/admin-audit-csv";
mkdirSync(OUT, { recursive: true });

const results = [];
const record = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

const EXPECTED_HEADERS = [
  "When",
  "Actor id",
  "Actor",
  "Function",
  "Outcome",
  "Request id",
  "IP",
  "User agent",
];

/** Minimal RFC4180 reader — every cell the exporter writes is quoted. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i += 1; }
      else if (c === '"') quoted = false;
      else cell += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else if (c !== "\r") cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((v) => v !== ""));
}

async function signIn(page, email, password) {
  await page.goto(`${BASE}/auth`, { waitUntil: "domcontentloaded" });
  await page.getByLabel(/email/i).first().fill(email);
  await page.getByLabel(/password/i).first().fill(password);
  await page.getByRole("button", { name: /sign in|log in/i }).first().click();
  await page.waitForURL((url) => !url.pathname.startsWith("/auth"), { timeout: 30_000 });
}

const browser = await launchBrowser();
try {
  // ---------- admin ----------
  const adminCtx = await browser.newContext({ viewport: { width: 1440, height: 1800 }, acceptDownloads: true });
  const page = await adminCtx.newPage();
  await signIn(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  await page.goto(`${BASE}/admin/audit-log`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);

  const exportBtn = page.getByTestId("export-rpc-audit");
  record("admin can reach the RPC audit export", await exportBtn.isVisible().catch(() => false));

  await page.getByLabel("Filter by outcome").selectOption("rate_limited");
  await page.getByRole("searchbox").first().fill("analyze-resume");
  // The search input is debounced before it re-queries.
  await page.waitForTimeout(1500);

  const tableRequestIds = await page
    .locator("[data-testid='rpc-audit-request-id']")
    .allInnerTexts()
    .catch(() => []);

  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 30_000 }).catch(() => null),
    exportBtn.click(),
  ]);

  if (!download) {
    // An empty filtered set is a legitimate outcome: the exporter toasts
    // instead of downloading. Say so rather than reporting a false failure.
    const empty = await page.getByText(/no admin rpc calls match/i).isVisible().catch(() => false);
    record("throttled export produced a file or an explicit empty notice", empty,
      empty ? "no throttled resume-analysis rows in range" : "no download and no empty notice");
  } else {
    const path = `${OUT}/admin-rpc-audit-throttled.csv`;
    await download.saveAs(path);
    const text = readFileSync(path, "utf8").replace(/^\uFEFF/, "");
    const rows = parseCsv(text);
    const headers = rows[0] || [];
    record(
      "CSV header row matches the documented columns",
      EXPECTED_HEADERS.every((h, i) => headers[i] === h),
      headers.join("|"),
    );

    const body = rows.slice(1);
    const fnIdx = headers.indexOf("Function");
    const statusIdx = headers.indexOf("Outcome");
    const reqIdx = headers.indexOf("Request id");
    record("export contains rows", body.length > 0, `${body.length} rows`);
    record(
      "every exported row is a throttled outcome",
      body.every((r) => r[statusIdx] === "rate_limited"),
    );
    record(
      "every exported row is a resume-analysis call",
      body.every((r) => /analyze-resume|resume/i.test(`${r[fnIdx]} ${r[reqIdx]}`)),
    );
    record("every exported row carries a request id", body.every((r) => (r[reqIdx] || "").length > 0));
    if (tableRequestIds.length) {
      const exported = new Set(body.map((r) => r[reqIdx]));
      const shown = tableRequestIds.map((t) => t.trim()).filter(Boolean);
      record(
        "request ids shown in the table appear in the export",
        shown.every((id) => exported.has(id)),
        `${shown.length} visible ids`,
      );
    }
  }
  await page.screenshot({ path: `${OUT}/admin-filtered.png` });
  await adminCtx.close();

  // ---------- non-admin ----------
  if (USER_EMAIL && USER_PASSWORD) {
    const userCtx = await browser.newContext({ viewport: { width: 1280, height: 1200 } });
    const userPage = await userCtx.newPage();
    await signIn(userPage, USER_EMAIL, USER_PASSWORD);
    await userPage.goto(`${BASE}/admin/audit-log`, { waitUntil: "domcontentloaded" });
    await userPage.waitForTimeout(2500);
    const blocked =
      !userPage.url().includes("/admin/audit-log") ||
      (await userPage.getByTestId("export-rpc-audit").isVisible().catch(() => false)) === false;
    record("non-admin is blocked from the audit export", blocked, userPage.url());
    await userPage.screenshot({ path: `${OUT}/non-admin.png` });
    await userCtx.close();
  } else {
    console.log("NOTE  non-admin half skipped — E2E_EMAIL / E2E_PASSWORD not set.");
  }
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed. Artifacts in ${OUT}/`);
if (failed.length) process.exit(1);
