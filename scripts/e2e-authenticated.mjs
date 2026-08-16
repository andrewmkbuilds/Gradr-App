#!/usr/bin/env node
/**
 * Authenticated end-to-end check.
 *
 * Signs in (real credentials, or a pre-minted Supabase session), then walks the
 * dashboard and every engine route asserting that:
 *   - the route actually rendered its own UI (not the auth screen, not a blank)
 *   - no uncaught page error or console error fired
 *   - the dashboard/root error fallback never appeared
 *
 * Credentials (either works):
 *   E2E_EMAIL / E2E_PASSWORD                       -> email+password sign-in
 *   LOVABLE_BROWSER_SUPABASE_STORAGE_KEY + _SESSION_JSON -> session injection
 *
 * Usage: node scripts/e2e-authenticated.mjs [baseUrl]
 */
import { launchBrowser } from "./lib/browser.mjs";

const BASE = (process.argv[2] ?? process.env.E2E_BASE_URL ?? "http://localhost:8080").replace(/\/$/, "");

const ROUTES = [
  { path: "/dashboard", name: "dashboard", expect: /dashboard|readiness|welcome back|good (morning|afternoon|evening)/i },
  { path: "/resume", name: "resume engine", expect: /resume/i },
  { path: "/jobs", name: "jobs feed", expect: /job/i },
  { path: "/match", name: "match engine", expect: /match/i },
  { path: "/pipeline", name: "pipeline", expect: /pipeline|application/i },
  { path: "/apply", name: "application engine", expect: /appl(y|ication)|cover letter/i },
  { path: "/interview", name: "interview engine", expect: /interview/i },
  { path: "/growth", name: "growth engine", expect: /growth|skill/i },
  { path: "/settings", name: "settings", expect: /settings|profile|preferences/i },
];

const IGNORED_CONSOLE =
  /favicon|net::ERR_|Failed to load resource|^Warning:|React Router Future Flag|Download the React DevTools|\[vite\]|Sentry Logger/i;

const results = [];
function record(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function signIn(page, context) {
  const storageKey = process.env.LOVABLE_BROWSER_SUPABASE_STORAGE_KEY;
  const sessionJson = process.env.LOVABLE_BROWSER_SUPABASE_SESSION_JSON;

  if (storageKey && sessionJson) {
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    await page.evaluate(
      ([k, v]) => window.localStorage.setItem(k, v),
      [storageKey, sessionJson],
    );
    await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
    return "injected session";
  }

  const email = process.env.E2E_EMAIL;
  const password = process.env.E2E_PASSWORD;
  if (!email || !password) {
    throw new Error(
      "No credentials: set E2E_EMAIL + E2E_PASSWORD, or LOVABLE_BROWSER_SUPABASE_STORAGE_KEY + _SESSION_JSON.",
    );
  }

  await page.goto(`${BASE}/auth`, { waitUntil: "domcontentloaded" });
  await page.getByLabel(/email/i).first().fill(email);
  await page.getByLabel(/password/i).first().fill(password);
  await page.getByRole("button", { name: /sign in|log in/i }).first().click();
  await page.waitForURL((url) => !/\/auth/.test(url.pathname), { timeout: 30_000 });
  return "password sign-in";
}

async function checkRoute(page, spec) {
  const errors = [];
  const onPageError = (e) => errors.push(`pageerror: ${e}`);
  const onConsole = (m) => {
    if (m.type() === "error" && !IGNORED_CONSOLE.test(m.text())) errors.push(`console: ${m.text()}`);
  };
  page.on("pageerror", onPageError);
  page.on("console", onConsole);

  try {
    await page.goto(`${BASE}${spec.path}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});

    if (/\/auth/.test(new URL(page.url()).pathname)) {
      record(spec.name, false, "redirected to /auth (session not authenticated)");
      return;
    }

    const crashed = await page.locator("[data-dashboard-error-fallback], [data-app-error-screen]").count();
    if (crashed > 0) {
      record(spec.name, false, "error fallback rendered");
      return;
    }

    const text = (await page.locator("body").innerText().catch(() => "")) || "";
    if (!spec.expect.test(text)) {
      record(spec.name, false, `expected content ${spec.expect} not found`);
      return;
    }

    if (errors.length) {
      record(spec.name, false, errors.slice(0, 3).join(" | "));
      return;
    }

    record(spec.name, true);
  } catch (err) {
    record(spec.name, false, String(err?.message ?? err));
  } finally {
    page.off("pageerror", onPageError);
    page.off("console", onConsole);
  }
}

async function main() {
  console.log(`Authenticated E2E against ${BASE}\n`);
  const browser = await launchBrowser();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  try {
    const method = await signIn(page, context);
    record(`sign-in (${method})`, !/\/auth/.test(new URL(page.url()).pathname), page.url());
  } catch (err) {
    record("sign-in", false, String(err?.message ?? err));
    await browser.close();
    return finish();
  }

  for (const spec of ROUTES) await checkRoute(page, spec);

  // Client-side navigation must keep working after visiting every route.
  try {
    await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
    record("navigation back to dashboard", !/\/auth/.test(new URL(page.url()).pathname), page.url());
  } catch (err) {
    record("navigation back to dashboard", false, String(err?.message ?? err));
  }

  await browser.close();
  finish();
}

function finish() {
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
