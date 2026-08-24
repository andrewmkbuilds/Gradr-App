#!/usr/bin/env node
/**
 * Route guard end-to-end suite.
 *
 * Covers, in one Playwright run:
 *   1. Unknown route -> friendly 404 page (never a blank screen).
 *   2. Authenticated session survives a hard refresh, and `/` + `/landing`
 *      resolve to the dashboard with no landing/marketing UI.
 *   3. Automated accessibility checks (axe-core) on the sign-in and dashboard
 *      flows — fails on serious/critical violations.
 *   4. HTTP status + caching/indexing headers for `/` and `/landing`.
 *   5. Visual regression snapshots for sign-in and dashboard so landing UI
 *      cannot silently reappear.
 *
 * Signed-in halves auto-skip when no preview session is available.
 *
 *   node scripts/route-guards-e2e.mjs [baseUrl]
 *   node scripts/route-guards-e2e.mjs --update      # refresh visual baselines
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { launchBrowser } from "./lib/browser.mjs";

const args = process.argv.slice(2);
const UPDATE = args.includes("--update");
const BASE = (args.find((a) => !a.startsWith("--")) ?? process.env.SMOKE_BASE_URL ?? "http://localhost:8080")
  .replace(/\/$/, "");

const ROOT = process.cwd();
const BASELINE_DIR = join(ROOT, "tests/visual/route-guards/baseline");
const CURRENT_DIR = join(ROOT, "tests/visual/route-guards/current");
const AXE_PATH = join(ROOT, "node_modules/axe-core/axe.min.js");
const DIFF_TOLERANCE = Number(process.env.VISUAL_TOLERANCE ?? 0.03);

const results = [];
function record(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}
function skip(name, why) {
  console.log(`SKIP  ${name} — ${why}`);
}

/** Marketing copy that only ever existed on the deleted landing/home pages. */
const LANDING_MARKERS = [/get started free/i, /trusted by/i, /how it works/i, /pricing plans/i];
const isBlank = (text) => text.replace(/\s+/g, "").length < 20;

function loadSession() {
  const key = process.env.LOVABLE_BROWSER_SUPABASE_STORAGE_KEY;
  const session = process.env.LOVABLE_BROWSER_SUPABASE_SESSION_JSON;
  if (key && session) return { key, session };
  const file = join(homedir(), ".cache/lovable-auth/session.json");
  if (!existsSync(file)) return null;
  const minted = JSON.parse(readFileSync(file, "utf8"));
  return { key: minted.storage_key, session: JSON.stringify(minted.session) };
}

async function visit(page, path) {
  await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(400);
  return {
    path: new URL(page.url()).pathname,
    text: (await page.locator("body").innerText().catch(() => "")).trim(),
  };
}

function assertNoLandingUi(label, text) {
  const hit = LANDING_MARKERS.find((re) => re.test(text));
  record(`${label}: no landing UI`, !hit, hit ? `matched ${hit}` : "");
}

/** Runs axe-core in the page and fails on serious/critical violations. */
async function checkA11y(page, label) {
  await page.addScriptTag({ path: AXE_PATH });
  const violations = await page.evaluate(async () => {
    const run = await window.axe.run(document, {
      resultTypes: ["violations"],
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa"] },
    });
    return run.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length }));
  });
  const blocking = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  record(
    `${label}: no serious/critical axe violations`,
    blocking.length === 0,
    blocking.map((v) => `${v.id}(${v.nodes})`).join(", "),
  );
  if (violations.length && !blocking.length) {
    console.log(`      minor axe findings: ${violations.map((v) => v.id).join(", ")}`);
  }
}

/** Coarse byte-level difference ratio — enough to catch layout/palette drift. */
function differenceRatio(a, b) {
  if (a.length !== b.length) return 1;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) diff += 1;
  return diff / a.length;
}

async function snapshot(page, name) {
  mkdirSync(BASELINE_DIR, { recursive: true });
  mkdirSync(CURRENT_DIR, { recursive: true });
  const file = `${name}.png`;
  const shot = await page.screenshot();
  const baseline = join(BASELINE_DIR, file);
  if (UPDATE || !existsSync(baseline)) {
    writeFileSync(baseline, shot);
    console.log(`${UPDATE ? "updated" : "created"} baseline ${file}`);
    return;
  }
  writeFileSync(join(CURRENT_DIR, file), shot);
  const ratio = differenceRatio(readFileSync(baseline), shot);
  record(`visual: ${file} within ${(DIFF_TOLERANCE * 100).toFixed(0)}%`, ratio <= DIFF_TOLERANCE, `${(ratio * 100).toFixed(1)}% changed`);
}

/** Raw HTTP probe: SPA routes must serve 200 HTML with sane cache headers. */
async function checkResponseHeaders(page, path) {
  const response = await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
  const status = response?.status();
  record(`headers: ${path} returns 200`, status === 200, `status ${status}`);

  const headers = response?.headers() ?? {};
  const cache = headers["cache-control"] ?? "";
  record(
    `headers: ${path} document is not cached long-term`,
    /no-cache|no-store|max-age=0/i.test(cache) || cache === "",
    `cache-control: ${cache || "(none)"}`,
  );

  // The router marks / and /landing noindex client-side; assert the tag lands.
  const robots = await page
    .locator('meta[name="robots"]')
    .first()
    .getAttribute("content")
    .catch(() => null);
  record(`headers: ${path} is marked noindex`, /noindex/i.test(robots ?? ""), `robots: ${robots ?? "(none)"}`);
}

async function run() {
  const browser = await launchBrowser({ headless: true });
  try {
    // ---- signed out -------------------------------------------------------
    const guest = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      colorScheme: "light",
      reducedMotion: "reduce",
    });
    const page = await guest.newPage();

    const missing = await visit(page, "/this-route-really-does-not-exist");
    record("guest: unknown route renders the 404 page", /404/.test(missing.text), missing.path);
    record("guest: 404 page is not blank", !isBlank(missing.text));
    record(
      "guest: 404 offers a way out",
      /sign in to gradr|back to dashboard/i.test(missing.text),
      missing.text.slice(0, 60).replace(/\s+/g, " "),
    );
    assertNoLandingUi("guest 404", missing.text);

    await checkResponseHeaders(page, "/");
    await checkResponseHeaders(page, "/landing");

    const auth = await visit(page, "/auth");
    record("guest: /auth renders the sign-in form", /sign in/i.test(auth.text), auth.path);
    assertNoLandingUi("sign-in", auth.text);
    await checkA11y(page, "sign-in");
    await snapshot(page, "signin-light");

    await guest.close();

    // ---- signed in --------------------------------------------------------
    const creds = loadSession();
    if (!creds) {
      skip("signed-in checks", "no preview session available");
    } else {
      const member = await browser.newContext({
        viewport: { width: 1280, height: 900 },
        colorScheme: "light",
        reducedMotion: "reduce",
      });
      const authed = await member.newPage();
      await authed.goto(BASE, { waitUntil: "domcontentloaded" });
      await authed.evaluate(([k, v]) => window.localStorage.setItem(k, v), [creds.key, creds.session]);

      const home = await visit(authed, "/");
      record("member: / renders the dashboard", home.path === "/" && !isBlank(home.text), `at ${home.path}`);
      assertNoLandingUi("dashboard", home.text);

      // Session persistence across a hard reload.
      await authed.reload({ waitUntil: "domcontentloaded" });
      await authed.waitForLoadState("networkidle").catch(() => {});
      await authed.waitForTimeout(600);
      const afterReload = {
        path: new URL(authed.url()).pathname,
        text: (await authed.locator("body").innerText().catch(() => "")).trim(),
      };
      record(
        "member: session persists after refresh",
        afterReload.path === "/" && !/sign in/i.test(afterReload.text) && !isBlank(afterReload.text),
        `at ${afterReload.path}`,
      );
      assertNoLandingUi("dashboard after refresh", afterReload.text);

      const landing = await visit(authed, "/landing");
      record("member: /landing -> dashboard", landing.path === "/", `landed on ${landing.path}`);
      assertNoLandingUi("/landing redirect", landing.text);

      const homeAlias = await visit(authed, "/home");
      record("member: /home -> dashboard", homeAlias.path === "/", `landed on ${homeAlias.path}`);

      const gone = await visit(authed, "/this-route-really-does-not-exist");
      record("member: unknown route renders the 404 page", /404/.test(gone.text) && !isBlank(gone.text));

      await visit(authed, "/");
      await checkA11y(authed, "dashboard");
      await snapshot(authed, "dashboard-light");

      await member.close();
    }
  } finally {
    await browser.close();
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} route guard checks passed.`);
  if (failed.length) process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
