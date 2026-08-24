#!/usr/bin/env node
/**
 * End-to-end smoke test: load the sign-in page, authenticate, land on the
 * dashboard, and assert no landing/marketing UI renders anywhere in the flow.
 *
 * Credentials come from E2E_EMAIL / E2E_PASSWORD. When they are absent the test
 * falls back to a pre-minted Lovable preview session; when neither exists it
 * skips (exit 0) so pull requests from forks don't fail on missing secrets.
 *
 * Usage: node scripts/e2e-signin-dashboard.mjs [baseUrl]
 */
import { chromium } from "playwright";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const BASE = (process.argv[2] ?? process.env.SMOKE_BASE_URL ?? "http://localhost:8080").replace(/\/$/, "");
const results = [];

function findChromium() {
  for (const envPath of [process.env.PLAYWRIGHT_CHROMIUM_PATH, process.env.CHROME_PATH]) {
    if (envPath && existsSync(envPath)) return envPath;
  }
  for (const root of ["/opt/ms-playwright", join(homedir(), ".cache/ms-playwright")]) {
    if (!existsSync(root)) continue;
    for (const dir of readdirSync(root).filter((d) => d.startsWith("chromium"))) {
      for (const rel of [
        "chrome-linux/chrome",
        "chrome-linux/headless_shell",
        "chrome-linux64/chrome-headless-shell",
      ]) {
        const candidate = join(root, dir, rel);
        if (existsSync(candidate)) return candidate;
      }
    }
  }
  return undefined;
}

function record(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

/** Marketing copy that only ever existed on the deleted landing page. */
const LANDING_MARKERS = [/get started free/i, /trusted by/i, /how it works/i, /pricing plans/i];

function assertNoLandingUi(label, text) {
  const hit = LANDING_MARKERS.find((re) => re.test(text));
  record(`${label}: no landing UI`, !hit, hit ? `matched ${hit}` : "");
}

function loadPreviewSession() {
  const key = process.env.LOVABLE_BROWSER_SUPABASE_STORAGE_KEY;
  const session = process.env.LOVABLE_BROWSER_SUPABASE_SESSION_JSON;
  if (key && session) return { key, session };
  const file = join(homedir(), ".cache/lovable-auth/session.json");
  if (!existsSync(file)) return null;
  const minted = JSON.parse(readFileSync(file, "utf8"));
  return { key: minted.storage_key, session: JSON.stringify(minted.session) };
}

async function bodyText(page) {
  return (await page.locator("body").innerText().catch(() => "")).trim();
}

async function run() {
  const email = process.env.E2E_EMAIL;
  const password = process.env.E2E_PASSWORD;
  const previewSession = loadPreviewSession();

  if (!email && !previewSession) {
    console.log("No E2E credentials and no preview session — skipping sign-in e2e smoke test.");
    return;
  }

  const browser = await chromium.launch({ headless: true, executablePath: findChromium() });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.new_page?.() ?? (await context.newPage());

    // ---- sign-in page -----------------------------------------------------
    await page.goto(`${BASE}/auth`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => {});
    const authText = await bodyText(page);
    record("sign-in page renders", /sign in/i.test(authText), new URL(page.url()).pathname);
    assertNoLandingUi("sign-in", authText);

    // ---- authenticate -----------------------------------------------------
    if (email && password) {
      await page.getByLabel(/email/i).first().fill(email);
      await page.getByLabel(/password/i).first().fill(password);
      await page.getByRole("button", { name: /sign in/i }).first().click();
      await page.waitForURL((url) => new URL(url).pathname === "/", { timeout: 30_000 }).catch(() => {});
    } else {
      await page.evaluate(
        ([k, v]) => window.localStorage.setItem(k, v),
        [previewSession.key, previewSession.session],
      );
      await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    }
    await page.waitForLoadState("networkidle").catch(() => {});

    // ---- dashboard --------------------------------------------------------
    const dashPath = new URL(page.url()).pathname;
    const dashText = await bodyText(page);
    record("authenticated user lands on the dashboard", dashPath === "/", `at ${dashPath}`);
    record("dashboard is not blank", dashText.replace(/\s+/g, "").length > 50);
    assertNoLandingUi("dashboard", dashText);

    await context.close();
  } finally {
    await browser.close();
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} e2e checks passed.`);
  if (failed.length) process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
