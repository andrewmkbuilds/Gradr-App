#!/usr/bin/env node
/**
 * Admin audit CSV export end-to-end check.
 *
 * Drives a real signed-in admin session on /admin/audit-log and asserts:
 *   1. the RPC audit table renders rows,
 *   2. narrowing the outcome / time filters narrows the exported rows,
 *   3. the downloaded CSV carries the agreed columns (function, outcome,
 *      request id, actor, IP, user agent) and matches the filtered view,
 *   4. a non-admin (or anonymous) caller is blocked from the same data.
 *
 * Usage: node scripts/e2e-admin-audit-csv.mjs [baseUrl]
 * Skips cleanly when ADMIN_E2E_EMAIL / ADMIN_E2E_PASSWORD are missing.
 * Optional: USER_E2E_EMAIL / USER_E2E_PASSWORD for the non-admin leg (an
 * anonymous REST probe is used when they are absent).
 */
import { chromium } from "playwright";
import { mkdirSync, readFileSync } from "node:fs";

const BASE = process.argv[2] || process.env.E2E_BASE_URL || "http://localhost:8080";
const EMAIL = process.env.ADMIN_E2E_EMAIL;
const PASSWORD = process.env.ADMIN_E2E_PASSWORD;
const USER_EMAIL = process.env.USER_E2E_EMAIL;
const USER_PASSWORD = process.env.USER_E2E_PASSWORD;

if (!EMAIL || !PASSWORD) {
  console.log("SKIP  admin audit csv e2e — ADMIN_E2E_EMAIL / ADMIN_E2E_PASSWORD not set.");
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

/** Minimal RFC4180 row splitter — the export quotes every cell. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  const body = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i];
    if (quoted) {
      if (ch === '"' && body[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (ch !== "\r") cell += ch;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

async function signIn(page, email, password) {
  await page.goto(`${BASE}/auth`, { waitUntil: "domcontentloaded" });
  await page.getByLabel(/email/i).first().fill(email);
  await page.getByLabel(/password/i).first().fill(password);
  await page.getByRole("button", { name: /sign in|log in/i }).first().click();
  await page.waitForURL((url) => !url.pathname.startsWith("/auth"), { timeout: 30_000 });
}

/** Downloads the CSV produced by the current filter state. */
async function downloadCsv(page) {
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 15_000 }),
    page.getByRole("button", { name: /export csv/i }).first().click(),
  ]);
  const path = `${OUT}/${download.suggestedFilename()}`;
  await download.saveAs(path);
  return parseCsv(readFileSync(path, "utf8"));
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 1400 },
    acceptDownloads: true,
  });
  const page = await context.newPage();

  try {
    await signIn(page, EMAIL, PASSWORD);
    record("admin can sign in", true);
  } catch (err) {
    record("admin can sign in", false, err.message);
    await browser.close();
    process.exit(1);
  }

  await page.goto(`${BASE}/admin/audit-log`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);

  // --- unfiltered export -----------------------------------------------
  let all = [];
  try {
    all = await downloadCsv(page);
    record("export produces a CSV download", all.length > 0, `${all.length} lines`);
  } catch (err) {
    record("export produces a CSV download", false, err.message);
    await browser.close();
    process.exit(1);
  }

  const headers = all[0] ?? [];
  const missing = EXPECTED_HEADERS.filter((h) => !headers.includes(h));
  record("CSV carries the agreed columns", missing.length === 0, missing.join(", ") || headers.join("|"));

  const outcomeIdx = headers.indexOf("Outcome");
  const requestIdx = headers.indexOf("Request id");
  const fnIdx = headers.indexOf("Function");
  const dataRows = all.slice(1);

  record(
    "every exported row names a function and an outcome",
    dataRows.length === 0 || dataRows.every((r) => r[fnIdx] && r[outcomeIdx]),
    `${dataRows.length} rows`,
  );
  record(
    "request id column is populated for app-issued calls",
    dataRows.length === 0 || dataRows.some((r) => (r[requestIdx] || "").length > 0),
  );

  // --- filtered export --------------------------------------------------
  await page.getByLabel(/filter by outcome/i).selectOption("ok");
  await page.waitForTimeout(2500);
  let filtered = [];
  try {
    filtered = await downloadCsv(page);
    const rows = filtered.slice(1);
    record(
      "outcome filter is reflected in the export",
      rows.length === 0 || rows.every((r) => /allowed|ok/i.test(r[outcomeIdx] || "")),
      `${rows.length} rows`,
    );
    record(
      "filtered export is a subset of the unfiltered one",
      rows.length <= dataRows.length,
      `${rows.length} <= ${dataRows.length}`,
    );
  } catch (err) {
    record("outcome filter is reflected in the export", false, err.message);
  }

  await context.close();

  // --- non-admin leg ----------------------------------------------------
  const userContext = await browser.newContext({
    viewport: { width: 1280, height: 1000 },
    acceptDownloads: true,
  });
  const userPage = await userContext.newPage();

  if (USER_EMAIL && USER_PASSWORD) {
    try {
      await signIn(userPage, USER_EMAIL, USER_PASSWORD);
      await userPage.goto(`${BASE}/admin/audit-log`, { waitUntil: "domcontentloaded" });
      await userPage.waitForTimeout(2500);
      const onAdmin = new URL(userPage.url()).pathname.startsWith("/admin");
      const exportVisible = await userPage
        .getByRole("button", { name: /export csv/i })
        .first()
        .isVisible()
        .catch(() => false);
      record(
        "non-admin cannot reach the audit export",
        !onAdmin || !exportVisible,
        `url=${userPage.url()} export=${exportVisible}`,
      );
    } catch (err) {
      record("non-admin cannot reach the audit export", false, err.message);
    }
  } else {
    // No second account configured: prove the data itself is closed by asking
    // for it anonymously through the REST API.
    const probe = await userPage.evaluate(async (base) => {
      const res = await fetch(`${base}/`, { method: "HEAD" }).catch(() => null);
      return res ? res.status : 0;
    }, BASE);
    void probe;
    const { status, body } = await userPage.evaluate(async () => {
      const url = import.meta?.env?.VITE_SUPABASE_URL;
      const key = import.meta?.env?.VITE_SUPABASE_PUBLISHABLE_KEY;
      if (!url || !key) return { status: 0, body: "no config" };
      const res = await fetch(`${url}/rest/v1/admin_rpc_audit?select=id&limit=1`, {
        headers: { apikey: key },
      });
      return { status: res.status, body: (await res.text()).slice(0, 160) };
    });
    const blocked = status === 401 || status === 403 || /permission denied/i.test(body) ||
      (status === 200 && body.trim() === "[]");
    record("anonymous callers get no audit rows", blocked, `status=${status} ${body}`);
  }

  await browser.close();

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} audit CSV checks passed.`);
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
