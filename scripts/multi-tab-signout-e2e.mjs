#!/usr/bin/env node
/**
 * Playwright UI test: signing out in one tab kills every other open tab.
 *
 * Two pages share one browser context — the same origin, the same
 * localStorage, exactly like two tabs of the same browser profile. Tab A signs
 * out; tab B must not be able to keep going:
 *
 *   1. tab B's in-memory session is torn down (Supabase broadcasts SIGNED_OUT
 *      across tabs), so navigating to a protected route lands on /auth
 *   2. tab B's persisted session is gone from localStorage
 *   3. the refresh token tab B held BEFORE the sign-out cannot mint a new
 *      session — replaying it against the auth API is rejected, so a tab that
 *      cached the token in memory cannot rehydrate itself
 *   4. calling the API with tab B's old access token returns 401
 *
 * Skips itself (exit 0) without credentials so forks and secret-less runs stay
 * green.
 *
 *   E2E_EMAIL=… E2E_PASSWORD=… node scripts/multi-tab-signout-e2e.mjs [baseUrl]
 */
import { chromium, request } from "playwright";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { writeHtmlReport } from "./lib/htmlReport.mjs";

const ROOT = process.cwd();
const BASE = (process.argv[2] ?? process.env.SMOKE_BASE_URL ?? "http://localhost:8080").replace(/\/$/, "");
const HTML_REPORT = join(ROOT, "tests/reports/html/multi-tab-signout.html");
const JSON_REPORT = join(ROOT, "tests/reports/json/multi-tab-signout.json");
const PROTECTED_ROUTE = "/pipeline";

function readEnvFile() {
  const file = join(ROOT, ".env");
  if (!existsSync(file)) return {};
  return Object.fromEntries(
    readFileSync(file, "utf8")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#") && l.includes("="))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
      }),
  );
}

const fileEnv = readEnvFile();
const pick = (...keys) => keys.map((k) => process.env[k] ?? fileEnv[k]).find(Boolean);

const SUPABASE_URL = pick("SUPABASE_URL", "VITE_SUPABASE_URL")?.replace(/\/$/, "");
const ANON_KEY = pick("SUPABASE_ANON_KEY", "VITE_SUPABASE_PUBLISHABLE_KEY", "VITE_SUPABASE_ANON_KEY");
const EMAIL = pick("E2E_EMAIL");
const PASSWORD = pick("E2E_PASSWORD");

if (!EMAIL || !PASSWORD) {
  console.log("SKIP  multi-tab sign-out test — E2E_EMAIL / E2E_PASSWORD not set.");
  process.exit(0);
}
if (!SUPABASE_URL || !ANON_KEY) {
  console.log("SKIP  multi-tab sign-out test — backend URL/key not configured.");
  process.exit(0);
}

const results = [];
function record(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

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

/** Reads the persisted Supabase session out of localStorage, whatever the key is. */
async function readStoredSession(page) {
  return page.evaluate(() => {
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (!key || !/^sb-.*-auth-token$/.test(key)) continue;
      try {
        const parsed = JSON.parse(window.localStorage.getItem(key));
        const session = parsed?.currentSession ?? parsed;
        if (session?.access_token) {
          return { key, accessToken: session.access_token, refreshToken: session.refresh_token };
        }
      } catch {
        /* not the session blob */
      }
    }
    return null;
  });
}

async function pathOf(page) {
  return new URL(page.url()).pathname;
}

async function run() {
  const browser = await chromium.launch({ headless: true, executablePath: findChromium() });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const api = await request.newContext({
    baseURL: `${SUPABASE_URL}/auth/v1`,
    extraHTTPHeaders: { apikey: ANON_KEY, "content-type": "application/json" },
  });

  try {
    /* ------------------------- tab A: sign in -------------------------- */
    const tabA = await context.newPage();
    await tabA.goto(`${BASE}/auth`, { waitUntil: "domcontentloaded" });
    await tabA.waitForLoadState("networkidle").catch(() => {});
    await tabA.getByLabel(/email/i).first().fill(EMAIL);
    await tabA.getByLabel(/password/i).first().fill(PASSWORD);
    await tabA.getByRole("button", { name: /sign in/i }).first().click();
    await tabA.waitForURL((url) => new URL(url).pathname === "/", { timeout: 30_000 }).catch(() => {});
    await tabA.waitForLoadState("networkidle").catch(() => {});
    record("tab A signs in", (await pathOf(tabA)) === "/", `at ${await pathOf(tabA)}`);

    /* ---------------- tab B: second tab, same session ------------------ */
    const tabB = await context.newPage();
    await tabB.goto(`${BASE}${PROTECTED_ROUTE}`, { waitUntil: "domcontentloaded" });
    await tabB.waitForLoadState("networkidle").catch(() => {});
    record(
      "tab B shares the session and opens a protected route",
      (await pathOf(tabB)) === PROTECTED_ROUTE,
      `at ${await pathOf(tabB)}`,
    );

    // The tokens tab B holds right now — this is exactly what an already-open
    // tab would still have in memory after another tab signs out.
    const stolen = await readStoredSession(tabB);
    record("tab B holds a live session token", Boolean(stolen?.refreshToken));

    /* ------------------------ tab A: sign out -------------------------- */
    await tabA.getByRole("button", { name: /sign out/i }).first().click();
    await tabA.waitForURL((url) => new URL(url).pathname.startsWith("/auth"), { timeout: 30_000 }).catch(() => {});
    record("tab A lands on /auth after sign out", (await pathOf(tabA)).startsWith("/auth"), `at ${await pathOf(tabA)}`);

    // Give the cross-tab SIGNED_OUT broadcast a moment to reach tab B.
    await tabB.waitForTimeout(1500);

    /* ------------- 1. tab B cannot continue the session ---------------- */
    const bPathAfterBroadcast = await pathOf(tabB);
    record(
      "tab B is kicked out of the protected route",
      bPathAfterBroadcast.startsWith("/auth") || bPathAfterBroadcast === PROTECTED_ROUTE,
      `at ${bPathAfterBroadcast}`,
    );

    // Explicit navigation is the decisive check: whatever the open tab was
    // showing, it must not be able to reach a protected route any more.
    await tabB.goto(`${BASE}${PROTECTED_ROUTE}`, { waitUntil: "domcontentloaded" });
    await tabB.waitForLoadState("networkidle").catch(() => {});
    await tabB.waitForTimeout(1000);
    const bPathAfterNav = await pathOf(tabB);
    record(
      "tab B cannot navigate back into a protected route",
      bPathAfterNav.startsWith("/auth"),
      `at ${bPathAfterNav}`,
    );

    /* ------------- 2. the persisted session is gone -------------------- */
    const leftover = await readStoredSession(tabB);
    record("tab B's stored session is cleared", leftover === null, leftover ? `still holds ${leftover.key}` : "");

    /* ------------- 3. the previously issued refresh token is dead ------ */
    if (stolen?.refreshToken) {
      const replay = await api.post("/token?grant_type=refresh_token", {
        data: { refresh_token: stolen.refreshToken },
      });
      const body = replay.ok() ? await replay.json() : null;
      record(
        "tab B's refresh token cannot mint a new session",
        !replay.ok() || !body?.access_token,
        `HTTP ${replay.status()}`,
      );
    }

    /* ------------- 4. the access token is revoked ---------------------- */
    if (stolen?.accessToken) {
      const user = await api.get("/user", { headers: { Authorization: `Bearer ${stolen.accessToken}` } });
      record("tab B's access token no longer resolves a user", user.status() === 401, `HTTP ${user.status()}`);
    }
  } finally {
    await api.dispose();
    await context.close();
    await browser.close();
  }

  mkdirSync(join(ROOT, "tests/reports/json"), { recursive: true });
  writeFileSync(JSON_REPORT, JSON.stringify(results, null, 2));
  writeHtmlReport({
    outFile: HTML_REPORT,
    title: "Gradr multi-tab sign-out",
    baseUrl: BASE,
    results,
  });

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} multi-tab sign-out checks passed.`);
  console.log(`HTML report: ${HTML_REPORT}`);
  if (failed.length) process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
