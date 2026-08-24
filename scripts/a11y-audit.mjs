#!/usr/bin/env node
/**
 * Full-app accessibility & contrast audit (Playwright + axe-core).
 *
 * Walks every public route at mobile and desktop widths, in light and dark
 * themes, and reports every axe violation. Serious/critical findings fail the
 * run; moderate/minor are printed so they stay visible.
 *
 * Usage:
 *   node scripts/a11y-audit.mjs                 # localhost:8080
 *   node scripts/a11y-audit.mjs https://gradr.me
 */
import { chromium } from "playwright";
import { existsSync, readdirSync, readFileSync } from "fs";
import { createRequire } from "module";
import { join } from "path";

const require = createRequire(import.meta.url);
const BASE = (process.argv[2] ?? process.env.SMOKE_BASE_URL ?? "http://localhost:8080").replace(/\/$/, "");
const AXE = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const BLOCKING = new Set(["serious", "critical"]);

// Signed-out reachable surfaces. Everything else in the app sits behind auth
// and is covered by the route-guard suite. `/landing` and `/home` stay in the
// list on purpose: they must keep redirecting after the marketing pages were
// deleted, and the audit checks the page they land on.
const ROUTES = [
  "/",
  "/auth",
  "/forgot-password",
  "/reset-password",
  "/landing",
  "/home",
  "/unsubscribe",
  "/this-route-does-not-exist",
];


const VIEWPORTS = [
  { name: "mobile", width: 390, height: 844 },
  { name: "desktop", width: 1440, height: 900 },
];

const THEMES = ["light", "dark"];

function findChromium() {
  for (const envPath of [process.env.PLAYWRIGHT_CHROMIUM_PATH, process.env.CHROME_PATH]) {
    if (envPath && existsSync(envPath)) return envPath;
  }
  for (const root of ["/opt/ms-playwright", join(process.env.HOME ?? "", ".cache/ms-playwright")]) {
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

async function launch() {
  try {
    return await chromium.launch();
  } catch {
    const executablePath = findChromium();
    if (!executablePath) throw new Error("No Chromium build available for Playwright.");
    return chromium.launch({ executablePath });
  }
}

const results = [];

const browser = await launch();
try {
  for (const viewport of VIEWPORTS) {
    for (const theme of THEMES) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        colorScheme: theme,
        reducedMotion: "reduce", // measure settled colors, not mid-animation frames
      });
      const page = await context.newPage();
      await page.addInitScript((t) => {
        try {
          window.localStorage.setItem("gradr-theme", t);
        } catch {
          /* storage unavailable */
        }
      }, theme);

      for (const route of ROUTES) {
        await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded" });
        // Routes such as /landing redirect on mount; wait for the navigation to
        // settle before injecting axe, or the execution context is destroyed
        // mid-injection and the whole run crashes.
        await page.waitForLoadState("networkidle").catch(() => {});
        await page.waitForTimeout(1200);
        await page.addScriptTag({ content: AXE }).catch(async () => {
          await page.waitForLoadState("networkidle").catch(() => {});
          await page.addScriptTag({ content: AXE });
        });
        const finalUrl = new URL(page.url()).pathname;
        const run = await page.evaluate(async () => {
          // eslint-disable-next-line no-undef
          return await window.axe.run(document, {
            resultTypes: ["violations"],
            runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
          });
        });
        for (const violation of run.violations) {
          results.push({
            route: finalUrl === route ? route : `${route} -> ${finalUrl}`,
            viewport: viewport.name,
            theme,
            id: violation.id,
            impact: violation.impact,
            help: violation.help,
            nodes: violation.nodes.slice(0, 3).map((n) => n.target.join(" ")),
          });
        }
      }
      await context.close();
    }
  }
} finally {
  await browser.close();
}

if (!results.length) {
  console.log("✓ No WCAG A/AA violations found across public routes (light + dark, mobile + desktop).");
  process.exit(0);
}

const blocking = results.filter((r) => BLOCKING.has(r.impact));
const grouped = new Map();
for (const r of results) {
  const key = `${r.id} [${r.impact}]`;
  if (!grouped.has(key)) grouped.set(key, []);
  grouped.get(key).push(r);
}

for (const [key, list] of grouped) {
  console.log(`\n${BLOCKING.has(list[0].impact) ? "✖" : "•"} ${key} — ${list[0].help}`);
  for (const r of list.slice(0, 8)) {
    console.log(`    ${r.route} (${r.viewport}/${r.theme}) → ${r.nodes.join(" | ")}`);
  }
  if (list.length > 8) console.log(`    … and ${list.length - 8} more occurrences`);
}

console.log(`\n${results.length} violation instance(s); ${blocking.length} blocking.`);
process.exit(blocking.length ? 1 : 0);
