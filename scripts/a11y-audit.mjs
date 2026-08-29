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
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { createRequire } from "module";
import { join } from "path";

const require = createRequire(import.meta.url);
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const BASE = (args.find((a) => !a.startsWith("--")) ?? process.env.SMOKE_BASE_URL ?? "http://localhost:8080").replace(
  /\/$/,
  "",
);
// Report file stem — one per audited surface (app / marketing).
const LABEL = flag("label", new URL(BASE).hostname.replace(/[^a-z0-9.-]/gi, "-"));
const OUT_DIR = flag("out", "reports/a11y");
const AXE = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const BLOCKING = new Set(["serious", "critical"]);


// Signed-out reachable surfaces. Everything else in the app sits behind auth
// and is covered by the route-guard suite. `/landing` and `/home` stay in the
// list on purpose: they must keep redirecting after the marketing pages were
// deleted, and the audit checks the page they land on.
const DEFAULT_ROUTES = [
  "/",
  "/auth",
  "/forgot-password",
  "/reset-password",
  "/landing",
  "/home",
  "/unsubscribe",
  "/this-route-does-not-exist",
];

// `--routes=/,/pricing,/blog` audits another surface (e.g. the marketing site)
// with the same rules and the same report format.
const ROUTES = flag("routes", "")
  ? flag("routes", "")
      .split(",")
      .map((r) => r.trim())
      .filter(Boolean)
  : DEFAULT_ROUTES;



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
        // Cross-origin redirects matter: several SEO paths on the app host
        // hand off to the marketing site, and a report that showed only the
        // pathname would blame the wrong codebase.
        const landed = new URL(page.url());
        const finalUrl = landed.origin === new URL(BASE).origin ? landed.pathname : landed.href;
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
            helpUrl: violation.helpUrl,
            // Full selector list, not a sample: the report has to name every
            // element a fix must touch.
            nodes: violation.nodes.map((n) => ({
              selector: n.target.join(" "),
              html: (n.html ?? "").slice(0, 400),
              summary: (n.failureSummary ?? "").replace(/\s+/g, " ").trim(),
            })),
          });
        }
      }
      await context.close();
    }
  }
} finally {
  await browser.close();
}

// Rules that gate the pipeline no matter what impact axe assigns them. These
// are the regressions this suite exists to catch: contrast collapses from
// class merging, and keyboard traps around scrollable panes.
const GATED_RULES = new Set([
  "color-contrast",
  "color-contrast-enhanced",
  "scrollable-region-focusable",
  "focus-order-semantics",
  "tabindex",
  "aria-hidden-focus",
]);

const isBlocking = (r) => BLOCKING.has(r.impact) || GATED_RULES.has(r.id);
const blocking = results.filter(isBlocking);

// ---- Reports -------------------------------------------------------------
const instances = results.reduce((n, r) => n + r.nodes.length, 0);
const report = {
  target: BASE,
  label: LABEL,
  generatedAt: new Date().toISOString(),
  routes: ROUTES,
  viewports: VIEWPORTS.map((v) => v.name),
  themes: THEMES,
  gatedRules: [...GATED_RULES],
  summary: {
    violations: results.length,
    nodeInstances: instances,
    blocking: blocking.length,
    byRule: Object.fromEntries(
      [...results.reduce((m, r) => m.set(r.id, (m.get(r.id) ?? 0) + r.nodes.length), new Map())],
    ),
  },
  violations: results.map((r) => ({ ...r, blocking: isBlocking(r) })),
};

mkdirSync(OUT_DIR, { recursive: true });
const jsonPath = join(OUT_DIR, `${LABEL}.json`);
const htmlPath = join(OUT_DIR, `${LABEL}.html`);
writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
writeFileSync(htmlPath, renderHtml(report));

function esc(value) {
  return String(value).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}

function renderHtml(data) {
  const rows = data.violations
    .flatMap((v) =>
      v.nodes.map(
        (n) => `<tr class="${v.blocking ? "blocking" : ""}">
  <td>${v.blocking ? "BLOCKING" : "advisory"}</td>
  <td><a href="${esc(v.helpUrl ?? "#")}">${esc(v.id)}</a><br><small>${esc(v.impact ?? "n/a")}</small></td>
  <td>${esc(v.route)}<br><small>${esc(v.viewport)} / ${esc(v.theme)}</small></td>
  <td><code>${esc(n.selector)}</code></td>
  <td><small>${esc(n.summary || v.help)}</small><br><code>${esc(n.html)}</code></td>
</tr>`,
      ),
    )
    .join("\n");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>Accessibility audit — ${esc(data.label)}</title>
<style>
 body{font:14px/1.5 system-ui,sans-serif;margin:2rem;color:#12212b}
 h1{font-size:1.4rem} table{border-collapse:collapse;width:100%}
 th,td{border:1px solid #d5dee2;padding:.5rem;text-align:left;vertical-align:top}
 th{background:#f2f0ef} code{font:12px/1.4 ui-monospace,monospace;word-break:break-all}
 tr.blocking td:first-child{color:#8a1c1c;font-weight:700}
 .meta{color:#55676d}
</style></head><body>
<h1>Accessibility audit — ${esc(data.label)}</h1>
<p class="meta">${esc(data.target)} · generated ${esc(data.generatedAt)} · ${data.summary.nodeInstances} failing element(s) across ${data.summary.violations} rule/route combination(s) · <strong>${data.summary.blocking} blocking</strong></p>
<p class="meta">Routes: ${data.routes.map(esc).join(", ")} · widths: ${data.viewports.map(esc).join(", ")} · themes: ${data.themes.map(esc).join(", ")}</p>
<table><thead><tr><th>Gate</th><th>Rule</th><th>Route</th><th>Selector</th><th>Failure</th></tr></thead>
<tbody>${rows || '<tr><td colspan="5">No violations found.</td></tr>'}</tbody></table>
</body></html>
`;
}

console.log(`\nReports written: ${jsonPath} · ${htmlPath}`);

// `--no-fail` writes the report and exits 0 so CI can decide the gate from the
// baseline diff (only *new* serious/critical findings should block a merge).
const NO_FAIL = args.includes("--no-fail");

if (!results.length) {
  console.log("✓ No WCAG A/AA violations found across public routes (light + dark, mobile + desktop).");
  process.exit(0);
}

const grouped = new Map();
for (const r of results) {
  const key = `${r.id} [${r.impact}]`;
  if (!grouped.has(key)) grouped.set(key, []);
  grouped.get(key).push(r);
}

for (const [key, list] of grouped) {
  console.log(`\n${isBlocking(list[0]) ? "✖" : "•"} ${key} — ${list[0].help}`);
  for (const r of list.slice(0, 8)) {
    console.log(`    ${r.route} (${r.viewport}/${r.theme}) → ${r.nodes.map((n) => n.selector).join(" | ")}`);
  }
  if (list.length > 8) console.log(`    … and ${list.length - 8} more occurrences`);
}

console.log(`\n${results.length} violation group(s), ${instances} element(s); ${blocking.length} blocking.`);
process.exit(!NO_FAIL && blocking.length ? 1 : 0);


