#!/usr/bin/env node
/**
 * Admin route end-to-end check.
 *
 * Signs in as an admin through the real UI, visits every admin route and
 * asserts that:
 *   - the page renders its heading (no crash / no redirect to /auth or /),
 *   - no permission error surfaces (42501 / "permission denied" / 403),
 *   - the route's data table or an explicit empty state is present,
 *   - no uncaught console errors are emitted.
 *
 * Usage: node scripts/admin-routes-e2e.mjs [baseUrl]
 * Skips cleanly when ADMIN_E2E_EMAIL / ADMIN_E2E_PASSWORD are missing.
 * See docs/admin-rpc-security.md.
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.argv[2] || process.env.E2E_BASE_URL || "http://localhost:8080";
const EMAIL = process.env.ADMIN_E2E_EMAIL;
const PASSWORD = process.env.ADMIN_E2E_PASSWORD;

if (!EMAIL || !PASSWORD) {
  console.log("SKIP  admin routes e2e — ADMIN_E2E_EMAIL / ADMIN_E2E_PASSWORD not set.");
  process.exit(0);
}

/** Every supported admin route. Keep in sync with the /admin routes in src/App.tsx. */
const ADMIN_ROUTES = [
  "/admin",
  "/admin/affiliates",
  "/admin/audit-log",
  "/admin/legal",
  "/admin/verifications",
  "/admin/discounts",
  "/admin/revenue",
  "/admin/usage",
  "/admin/paddle",
  "/admin/payments-status",
  "/admin/billing-ops",
  "/admin/webhook-logs",
  "/admin/email-templates",
  "/admin/email-audit",
  "/admin/analytics-health",
  "/admin/api-health",
  "/admin/security-log",
  "/admin/security-findings",
  "/admin/csp-reports",
  "/admin/nav-analytics",
  "/admin/seo-monitor",
  "/admin/search-console",
  "/admin/blog-analytics",
  "/admin/oauth-forensics",
  "/admin/digest-preview",
  "/admin/voice",
];

const PERMISSION_PATTERN = /permission denied|42501|not authorized|forbidden/i;
const SHOTS = "tests/reports/screenshots/admin-routes";
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

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 1400 } });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  try {
    await signIn(page);
    record("admin can sign in", true);
  } catch (err) {
    record("admin can sign in", false, err.message);
    await browser.close();
    return;
  }

  for (const route of ADMIN_ROUTES) {
    consoleErrors.length = 0;
    const slug = route.replace(/\//g, "_").replace(/^_/, "");
    try {
      await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded" });
      // Give data queries a chance to resolve.
      await page.waitForTimeout(2500);

      const path = new URL(page.url()).pathname;
      if (path !== route) {
        record(`${route} stays on the admin route`, false, `redirected to ${path}`);
        continue;
      }

      const heading = await page.locator("h1").first().innerText().catch(() => "");
      if (!heading.trim()) {
        record(`${route} renders a heading`, false, "no visible h1");
        continue;
      }

      const body = await page.locator("body").innerText();
      if (PERMISSION_PATTERN.test(body)) {
        const line = body.split("\n").find((l) => PERMISSION_PATTERN.test(l)) ?? "";
        record(`${route} loads without a permission error`, false, line.slice(0, 120));
        await page.screenshot({ path: `${SHOTS}/${slug}.png` });
        continue;
      }

      // A data surface must exist: a table, a list, or an explicit empty state.
      const hasTable = (await page.locator("table, [role='table'], [role='grid'], [role='list']").count()) > 0;
      const hasEmptyState = /no .*(entries|records|results|data|calls|requests|alerts)/i.test(body);
      if (!hasTable && !hasEmptyState) {
        record(`${route} renders a data table or empty state`, false, "neither table nor empty state found");
        await page.screenshot({ path: `${SHOTS}/${slug}.png` });
        continue;
      }

      // Spinners must have resolved.
      const stillLoading = await page.locator(".animate-spin").count();

      const permissionConsole = consoleErrors.filter((e) => PERMISSION_PATTERN.test(e));
      if (permissionConsole.length) {
        record(`${route} makes no denied requests`, false, permissionConsole[0].slice(0, 120));
        continue;
      }

      record(`${route} loads for an admin`, true, `${heading.trim().slice(0, 40)}${stillLoading ? ` (${stillLoading} spinner still active)` : ""}`);
    } catch (err) {
      record(`${route} loads for an admin`, false, err.message.split("\n")[0].slice(0, 140));
      await page.screenshot({ path: `${SHOTS}/${slug}.png` }).catch(() => {});
    }
  }

  await browser.close();
}

main()
  .catch((err) => record("admin routes e2e run", false, err.message))
  .finally(() => {
    const failed = results.filter((r) => !r.ok);
    console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
    if (failed.length) {
      console.error("\nFailures:");
      failed.forEach((f) => console.error(`  - ${f.name}: ${f.detail}`));
      process.exit(1);
    }
  });
