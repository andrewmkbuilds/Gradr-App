#!/usr/bin/env node
/**
 * Console-error sweep.
 *
 * Visits every static route declared in src/App.tsx (signed in when a preview
 * session is available, otherwise signed out) and fails the build if any route
 * emits a console error, a page error, or an unhandled promise rejection.
 *
 * Known, environment-only noise lives in IGNORED below — keep that list short
 * and justified; everything else is a real regression.
 *
 * Usage: node scripts/console-sweep.mjs [baseUrl] [--json]
 */
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { launchBrowser } from "./lib/browser.mjs";
import { matchAllowlist, CONSOLE_ALLOWLIST } from "./lib/console-allowlist.mjs";

const args = process.argv.slice(2);
const BASE = (args.find((a) => a.startsWith("http")) ?? process.env.SMOKE_BASE_URL ?? "http://localhost:8080").replace(/\/$/, "");
const AS_JSON = args.includes("--json");
const OUT_DIR = "test-results/console-sweep";

/**
 * Messages that are environment noise, not app defects.
 *
 * The list itself lives in scripts/lib/console-allowlist.mjs so route-smoke
 * and this sweep can never drift apart, and so every suppression carries a
 * documented reason. Anything not matched there still fails the build.
 */

/** Routes that intentionally cannot be swept (params, external redirects). */
const SKIP = new Set(["*", "/auth/callback"]);

function routesFromApp() {
  const src = readFileSync("src/App.tsx", "utf8");
  const found = new Set();
  for (const match of src.matchAll(/path="([^"]+)"/g)) {
    const path = match[1];
    if (path.includes(":") || path.includes("*") || SKIP.has(path)) continue;
    found.add(path.startsWith("/") ? path : `/${path}`);
  }
  return [...found].sort();
}

function loadSession() {
  const key = process.env.LOVABLE_BROWSER_SUPABASE_STORAGE_KEY;
  const session = process.env.LOVABLE_BROWSER_SUPABASE_SESSION_JSON;
  if (key && session) return { key, session };
  const file = join(homedir(), ".cache/lovable-auth/session.json");
  if (!existsSync(file)) return null;
  const minted = JSON.parse(readFileSync(file, "utf8"));
  return { key: minted.storage_key, session: JSON.stringify(minted.session) };
}

const isIgnored = (text) => IGNORED.some((re) => re.test(text));

const routes = routesFromApp();
const session = loadSession();
const browser = await launchBrowser({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();

if (session) {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate(([k, v]) => window.localStorage.setItem(k, v), [session.key, session.session]);
}

const failures = [];
const swept = [];

for (const route of routes) {
  const problems = [];
  const onConsole = (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (!isIgnored(text)) problems.push({ kind: "console", text });
  };
  const onPageError = (err) => {
    const text = err instanceof Error ? `${err.message}` : String(err);
    if (!isIgnored(text)) problems.push({ kind: "pageerror", text });
  };
  page.on("console", onConsole);
  page.on("pageerror", onPageError);

  try {
    await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(600);
  } catch (error) {
    problems.push({ kind: "navigation", text: error instanceof Error ? error.message : String(error) });
  }

  page.off("console", onConsole);
  page.off("pageerror", onPageError);

  const landed = new URL(page.url()).pathname;
  swept.push({ route, landed, problems });
  if (problems.length) failures.push({ route, landed, problems });
  console.log(`${problems.length ? "FAIL" : "PASS"}  ${route}${landed !== route ? ` -> ${landed}` : ""}${problems.length ? ` (${problems.length})` : ""}`);
  for (const p of problems) console.log(`        [${p.kind}] ${p.text.slice(0, 300)}`);
}

await browser.close();

mkdirSync(OUT_DIR, { recursive: true });
const report = { base: BASE, signedIn: Boolean(session), total: routes.length, failed: failures.length, routes: swept };
writeFileSync(join(OUT_DIR, "console-sweep.json"), JSON.stringify(report, null, 2));

if (AS_JSON) console.log(JSON.stringify(report, null, 2));
console.log(`\n${routes.length - failures.length}/${routes.length} routes clean (${session ? "signed in" : "signed out"}).`);

if (failures.length) {
  console.error(`\nConsole errors on ${failures.length} route(s). Full report: ${OUT_DIR}/console-sweep.json`);
  process.exit(1);
}
