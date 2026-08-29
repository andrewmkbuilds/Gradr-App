#!/usr/bin/env node
/**
 * Route smoke test: verifies the key screens load and that the redirects left
 * behind by the deleted Landing/Home pages still resolve correctly.
 *
 * Signed-out expectations:
 *   /            -> /auth        (no marketing page in the app surface)
 *   /landing     -> /auth        (via / )
 *   /home        -> /auth        (via / )
 *   /auth        -> sign-in form renders
 *   /pricing     -> public pricing renders
 *   /nope-404    -> friendly 404, not a blank screen or sign-in detour
 *
 * Signed-in expectations (only when a Lovable preview session is available):
 *   /            -> dashboard renders
 *   /landing     -> /
 *   /auth        -> /            (already authenticated)
 *   /nope-404    -> friendly 404 inside the app chrome
 *
 * Usage: node scripts/route-smoke.mjs [baseUrl]     (default http://localhost:8080)
 */
import { chromium } from "playwright";
import { partitionConsoleMessages, describeIgnored } from "./lib/console-allowlist.mjs";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const BASE = (process.argv[2] ?? process.env.SMOKE_BASE_URL ?? "http://localhost:8080").replace(/\/$/, "");
const results = [];

/** Locates the sandbox/CI Chromium build Playwright downloaded. */
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

/** Reads a preview session from the env or a locally minted session file. */
function loadSession() {
  const key = process.env.LOVABLE_BROWSER_SUPABASE_STORAGE_KEY;
  const session = process.env.LOVABLE_BROWSER_SUPABASE_SESSION_JSON;
  if (key && session) return { key, session };
  const file = join(homedir(), ".cache/lovable-auth/session.json");
  if (!existsSync(file)) return null;
  const minted = JSON.parse(readFileSync(file, "utf8"));
  return { key: minted.storage_key, session: JSON.stringify(minted.session) };
}

/** Navigates and returns the settled pathname plus the visible body text. */
async function visit(page, path) {
  await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(400);
  return {
    path: new URL(page.url()).pathname,
    text: (await page.locator("body").innerText().catch(() => "")).trim(),
  };
}

const isBlank = (text) => text.replace(/\s+/g, "").length < 20;

async function checkRedirect(page, from, to, label) {
  const { path, text } = await visit(page, from);
  record(`${label}: ${from} -> ${to}`, path === to, `landed on ${path}`);
  record(`${label}: ${from} is not blank`, !isBlank(text));
}

async function run() {
  const browser = await chromium.launch({ headless: true, executablePath: findChromium() });
  try {
    // ---- signed out -------------------------------------------------------
    const guest = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await guest.newPage();
    // Known environment noise is filtered through the shared, documented
    // allowlist (scripts/lib/console-allowlist.mjs) so every suppression has a
    // reason attached and is suppressed identically in every smoke script.
    const consoleMessages = [];
    page.on("console", (m) => m.type() === "error" && consoleMessages.push(m.text()));

    await checkRedirect(page, "/", "/auth", "guest");
    await checkRedirect(page, "/landing", "/auth", "guest");
    await checkRedirect(page, "/home", "/auth", "guest");

    const auth = await visit(page, "/auth");
    record("guest: /auth renders the sign-in form", /sign in/i.test(auth.text), auth.path);

    const pricing = await visit(page, "/pricing");
    record("guest: /pricing renders", pricing.path === "/pricing" && !isBlank(pricing.text));

    const missing = await visit(page, "/this-route-does-not-exist");
    record(
      "guest: unknown route shows the 404 page",
      /404/.test(missing.text) && !isBlank(missing.text),
      missing.path,
    );

    const { failures: consoleErrors, ignored } = partitionConsoleMessages(consoleMessages);
    if (ignored.length) console.log(`      (ignored known noise: ${describeIgnored(ignored)})`);
    record("guest: no console errors", consoleErrors.length === 0, consoleErrors.slice(0, 2).join(" | "));
    await guest.close();

    // ---- signed in --------------------------------------------------------
    const creds = loadSession();
    if (!creds) {
      console.log("\nNo preview session available — skipping signed-in route checks.");
    } else {
      const member = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const authed = await member.newPage();
      await authed.goto(BASE, { waitUntil: "domcontentloaded" });
      await authed.evaluate(
        ([k, v]) => window.localStorage.setItem(k, v),
        [creds.key, creds.session],
      );

      const home = await visit(authed, "/");
      record("member: / renders the dashboard", home.path === "/" && !isBlank(home.text));

      const landing = await visit(authed, "/landing");
      record("member: /landing -> /", landing.path === "/", `landed on ${landing.path}`);

      const homeAlias = await visit(authed, "/home");
      record("member: /home -> /", homeAlias.path === "/", `landed on ${homeAlias.path}`);

      const signIn = await visit(authed, "/auth");
      record("member: /auth -> /", signIn.path === "/", `landed on ${signIn.path}`);

      for (const route of ["/resume", "/jobs", "/interview", "/settings", "/billing"]) {
        const r = await visit(authed, route);
        record(`member: ${route} renders`, r.path === route && !isBlank(r.text));
      }

      const gone = await visit(authed, "/this-route-does-not-exist");
      record("member: unknown route shows the 404 page", /404/.test(gone.text));
      await member.close();
    }
  } finally {
    await browser.close();
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} route checks passed.`);
  if (failed.length) process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
