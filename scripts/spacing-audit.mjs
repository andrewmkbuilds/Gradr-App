#!/usr/bin/env node
/**
 * Vertical rhythm audit / regression test.
 *
 * Walks every public marketing + tool route at mobile, tablet and desktop
 * widths and measures the vertical gap between adjacent visible blocks inside
 * <main> (and between the last block and the footer). Any gap larger than the
 * per-width budget is reported as an unexplained whitespace band.
 *
 * The budgets are derived from the shared rhythm scale in src/index.css:
 * the largest intentional gap is --rhythm-3xl (2.25 x the fluid unit) plus a
 * section's own padding, so anything past ~3.5x the unit is drift, not design.
 *
 * On top of the numbers it captures a full-page screenshot per route and
 * breakpoint, diffs it against the committed baseline and writes a per-route
 * HTML report with baseline / current / diff side by side.
 *
 *   bun run audit:spacing            # report + fail on new or worsening gaps
 *   bun run audit:spacing -- --report-only
 *   bun run audit:spacing -- --update  # accept current numbers + screenshots
 *
 * See docs/vertical-rhythm.md for how to read the report.
 *
 * The deployed bundle pins a single surface, so the public routes below only
 * exist behind their path prefixes in multi-surface mode. Unless
 * AUDIT_BASE_URL points somewhere else, this boots its own Vite server with
 * `--mode audit` (see .env.audit) so every route actually renders.
 */
import { chromium } from "playwright";
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

const AUDIT_PORT = Number(process.env.AUDIT_PORT ?? 8090);
const BASE = process.env.AUDIT_BASE_URL ?? `http://localhost:${AUDIT_PORT}`;
const OWNS_SERVER = !process.env.AUDIT_BASE_URL;
const REPORT_ONLY = process.argv.includes("--report-only");
const UPDATE = process.argv.includes("--update");

const OUT_DIR = "test-results/spacing-audit";
const BASELINE_DIR = "tests/spacing/baseline";
const BASELINE_FILE = "tests/spacing/baseline.json";
/** A gap may grow by this much before it counts as a regression (px). */
const TOLERANCE = Number(process.env.SPACING_TOLERANCE ?? 8);

async function startAuditServer() {
  const child = spawn(
    "bunx",
    ["vite", "--mode", "audit", "--port", String(AUDIT_PORT), "--strictPort"],
    { stdio: "ignore", detached: true },
  );
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`${BASE}/`);
      if (res.ok) return child;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`audit server did not start on port ${AUDIT_PORT}`);
}

/** Public marketing + tool routes. Auth-gated app routes are out of scope. */
const ROUTES = [
  "/ats-resume-checker",
  "/ai-cover-letter-generator",
  "/ai-interview-coach",
  "/ai-career-coach",
  "/job-application-tracker",
  "/pricing",
  "/career-advice",
  "/blog/ai-resume-optimization",
  "/job-search",
  "/legal",
  "/privacy",
  "/terms",
  "/refund-policy",
  "/cookie-policy",
  "/dpa",
  "/acceptable-use",
  "/ai-disclosure",
  "/disclaimer",
  "/affiliate-disclosure",
  "/subprocessors",
  "/marketing",
  "/news",
  "/docs",
  "/support",
  "/status",
  "/affiliate",
];

/** width, label, max tolerated gap between adjacent blocks (px). */
const VIEWPORTS = [
  { label: "mobile", width: 390, height: 1400, budget: 72 },
  { label: "tablet", width: 768, height: 1400, budget: 88 },
  { label: "desktop", width: 1280, height: 1600, budget: 104 },
];

const slug = (route) => (route === "/" ? "root" : route.replace(/^\//, "").replace(/\//g, "-"));
const shotName = (route, vp) => `${slug(route)}-${vp}.png`;

const measure = (budget) =>
  // Runs in the page. Collects gaps between adjacent visible blocks.
  new Function(
    "budget",
    `
    const root = document.querySelector('main') || document.body;
    const findings = [];
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.height > 0 && r.width > 0 && s.visibility !== 'hidden' && s.display !== 'none';
    };
    const label = (el) => {
      const cls = (el.className && typeof el.className === 'string' ? el.className : '').split(/\\s+/).slice(0, 3).join('.');
      return el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (cls ? '.' + cls : '');
    };
    const scan = (parent, depth) => {
      const kids = Array.from(parent.children).filter(visible).filter((el) => {
        const p = getComputedStyle(el).position;
        return p !== 'fixed' && p !== 'absolute';
      });
      for (let i = 0; i < kids.length - 1; i++) {
        const a = kids[i].getBoundingClientRect();
        const b = kids[i + 1].getBoundingClientRect();
        const gap = Math.round(b.top - a.bottom);
        if (gap > budget) {
          findings.push({ gap, depth, before: label(kids[i]), after: label(kids[i + 1]) });
        }
      }
      if (depth < 2) kids.forEach((k) => scan(k, depth + 1));
    };
    scan(root, 0);

    // Trailing band: last block inside main -> footer.
    // On a page shorter than the viewport the layout deliberately pushes the
    // footer to the bottom edge, so that space is a sticky-footer spacer, not
    // drift. Only a page that actually scrolls can have a real trailing gap.
    const pageScrolls = document.documentElement.scrollHeight > window.innerHeight + 8;
    const kids = Array.from(root.children).filter(visible);
    const last = kids[kids.length - 1];
    const footer = document.querySelector('footer');
    if (pageScrolls && last && footer) {
      const gap = Math.round(footer.getBoundingClientRect().top - last.getBoundingClientRect().bottom);
      if (gap > budget) findings.push({ gap, depth: 0, before: label(last), after: 'footer' });
    }

    return findings;
  `,
  )(budget);

const loadBaseline = () =>
  existsSync(BASELINE_FILE)
    ? JSON.parse(readFileSync(BASELINE_FILE, "utf8"))
    : { tolerance: TOLERANCE, worstGap: {} };

/** Pixel-diff current against baseline; writes the diff PNG. @returns {object|null} */
function diffScreenshot(name) {
  const basePath = path.join(BASELINE_DIR, name);
  const curPath = path.join(OUT_DIR, "current", name);
  if (!existsSync(basePath) || !existsSync(curPath)) return null;
  const base = PNG.sync.read(readFileSync(basePath));
  const cur = PNG.sync.read(readFileSync(curPath));
  const width = Math.min(base.width, cur.width);
  const height = Math.min(base.height, cur.height);
  const out = new PNG({ width, height });
  const crop = (img) => {
    if (img.width === width && img.height === height) return img;
    const c = new PNG({ width, height });
    PNG.bitblt(img, c, 0, 0, width, height, 0, 0);
    return c;
  };
  const changed = pixelmatch(
    crop(base).data,
    crop(cur).data,
    out.data,
    width,
    height,
    { threshold: 0.12 },
  );
  const diffPath = path.join(OUT_DIR, "diff", name);
  mkdirSync(path.dirname(diffPath), { recursive: true });
  writeFileSync(diffPath, PNG.sync.write(out));
  return {
    changedPixels: changed,
    ratio: changed / (width * height),
    heightDelta: cur.height - base.height,
  };
}

const esc = (v) =>
  String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function writeHtml({ routes, failures, baseUrl }) {
  const section = (r) => `
  <section class="route">
    <h2>${esc(r.route)} ${r.status === "fail" ? '<span class="tag fail">REGRESSION</span>' : r.status === "warn" ? '<span class="tag warn">over budget</span>' : '<span class="tag ok">clean</span>'}</h2>
    ${r.breakpoints
      .map(
        (b) => `
      <h3>${esc(b.viewport)} · ${b.width}px — worst gap ${b.worstGap}px (budget ${b.budget}px, baseline ${b.baseline ?? "—"})${
        b.diff ? ` · ${b.diff.changedPixels.toLocaleString()} px changed, height ${b.diff.heightDelta >= 0 ? "+" : ""}${b.diff.heightDelta}px` : " · no baseline yet"
      }</h3>
      <div class="triptych">
        <figure><figcaption>before (baseline)</figcaption>${b.hasBaseline ? `<img loading="lazy" src="../../${BASELINE_DIR}/${b.shot}" alt="baseline ${esc(r.route)} ${b.viewport}" />` : '<div class="none">none committed</div>'}</figure>
        <figure><figcaption>after (current)</figcaption><img loading="lazy" src="current/${b.shot}" alt="current ${esc(r.route)} ${b.viewport}" /></figure>
        <figure><figcaption>diff</figcaption>${b.diff ? `<img loading="lazy" src="diff/${b.shot}" alt="diff ${esc(r.route)} ${b.viewport}" />` : '<div class="none">n/a</div>'}</figure>
      </div>
      ${
        b.findings.length
          ? `<table><tr><th>gap</th><th>between</th></tr>${b.findings
              .map((f) => `<tr><td>${f.gap}px</td><td>${esc(f.before)} → ${esc(f.after)}</td></tr>`)
              .join("")}</table>`
          : '<p class="muted">No gap over budget.</p>'
      }`,
      )
      .join("")}
  </section>`;

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Spacing audit</title>
<style>
:root{color-scheme:light dark;--bg:#f9f7f6;--fg:#1b2225;--muted:#55676d;--line:#dcd9d7;--ok:#256074;--fail:#8c2f26;--warn:#733e24;--card:#fff}
@media (prefers-color-scheme:dark){:root{--bg:#131a1d;--fg:#eef2f3;--muted:#a9b8bd;--line:#2b3639;--card:#1a2225}}
body{margin:0;padding:32px;background:var(--bg);color:var(--fg);font:15px/1.5 ui-sans-serif,system-ui,sans-serif}
h1{font-size:22px;margin:0 0 4px}.meta{color:var(--muted);font-size:13px;margin-bottom:24px}
.route{background:var(--card);border:1px solid var(--line);border-radius:11px;padding:16px;margin-bottom:20px}
h2{font-size:17px;margin:0 0 8px}h3{font-size:13px;color:var(--muted);font-weight:600;margin:16px 0 6px}
.tag{font:600 11px/1.6 ui-monospace,monospace;letter-spacing:.06em;padding:2px 8px;border-radius:999px;border:1px solid var(--line)}
.tag.fail{color:var(--fail)}.tag.warn{color:var(--warn)}.tag.ok{color:var(--ok)}
.triptych{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
figure{margin:0}figcaption{font:600 11px/1.6 ui-monospace,monospace;color:var(--muted)}
img{width:100%;border:1px solid var(--line);border-radius:8px;background:#fff}
.none{border:1px dashed var(--line);border-radius:8px;padding:24px;text-align:center;color:var(--muted);font-size:12px}
table{width:100%;border-collapse:collapse;margin-top:10px;font-size:13px}
th,td{text-align:left;padding:6px 8px;border-top:1px solid var(--line);color:var(--muted)}
.muted{color:var(--muted);font-size:13px}
</style></head><body>
<h1>Vertical spacing audit — ${failures.length ? `<span style="color:var(--fail)">${failures.length} regression(s)</span>` : '<span style="color:var(--ok)">clean</span>'}</h1>
<div class="meta">${esc(baseUrl)} · ${new Date().toISOString()} · tolerance ${TOLERANCE}px · see docs/vertical-rhythm.md</div>
${routes.map(section).join("\n")}
</body></html>`;
  writeFileSync(path.join(OUT_DIR, "index.html"), html);
}

async function run() {
  rmSync(path.join(OUT_DIR, "diff"), { recursive: true, force: true });
  mkdirSync(path.join(OUT_DIR, "current"), { recursive: true });
  mkdirSync(path.join(OUT_DIR, "diff"), { recursive: true });
  if (UPDATE) mkdirSync(BASELINE_DIR, { recursive: true });

  const baseline = loadBaseline();
  const server = OWNS_SERVER ? await startAuditServer() : null;
  const stopServer = () => {
    if (server?.pid) {
      try {
        process.kill(-server.pid);
      } catch {
        /* already gone */
      }
    }
  };
  server?.unref();
  process.on("exit", stopServer);

  const browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  });

  const rows = [];
  const redirected = [];
  /** route -> viewport -> data */
  const perRoute = new Map(ROUTES.map((r) => [r, []]));

  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await context.newPage();
    for (const route of ROUTES) {
      try {
        await page.goto(`${BASE}${route}`, { waitUntil: "networkidle", timeout: 30_000 });
      } catch {
        await page.waitForTimeout(500);
      }
      await page.waitForTimeout(350);
      const landed = new URL(page.url()).pathname.replace(/\/$/, "") || "/";
      if (landed !== route) redirected.push(`${route} → ${landed} (${vp.label})`);

      const findings = await page.evaluate(measure, vp.budget).catch(() => []);
      for (const f of findings) rows.push({ route, viewport: vp.label, budget: vp.budget, ...f });

      const shot = shotName(route, vp.label);
      await page
        .screenshot({ path: path.join(OUT_DIR, "current", shot), fullPage: true, animations: "disabled" })
        .catch(() => {});
      if (UPDATE) {
        const cur = path.join(OUT_DIR, "current", shot);
        if (existsSync(cur)) writeFileSync(path.join(BASELINE_DIR, shot), readFileSync(cur));
      }

      const key = `${route}|${vp.label}`;
      const worstGap = findings.reduce((m, f) => Math.max(m, f.gap), 0);
      const prev = baseline.worstGap?.[key];
      perRoute.get(route).push({
        viewport: vp.label,
        width: vp.width,
        budget: vp.budget,
        shot,
        findings,
        worstGap,
        baseline: prev,
        hasBaseline: existsSync(path.join(BASELINE_DIR, shot)),
        diff: diffScreenshot(shot),
        key,
      });
    }
    await context.close();
  }
  await browser.close();

  // A finding fails only when it is new or worse than the accepted baseline.
  const failures = [];
  for (const [route, breakpoints] of perRoute) {
    for (const b of breakpoints) {
      const prev = b.baseline;
      if (b.worstGap <= b.budget) continue;
      if (prev === undefined) {
        failures.push(`${route} (${b.viewport}): new gap ${b.worstGap}px over budget ${b.budget}px`);
      } else if (b.worstGap > prev + TOLERANCE) {
        failures.push(
          `${route} (${b.viewport}): gap grew ${prev}px → ${b.worstGap}px (tolerance ${TOLERANCE}px)`,
        );
      }
    }
  }

  const routeReports = [...perRoute].map(([route, breakpoints]) => ({
    route,
    breakpoints,
    status: failures.some((f) => f.startsWith(`${route} (`))
      ? "fail"
      : breakpoints.some((b) => b.worstGap > b.budget)
        ? "warn"
        : "ok",
  }));

  writeHtml({ routes: routeReports, failures, baseUrl: BASE });

  const lines = [
    "# Vertical spacing audit",
    "",
    `Base: ${BASE}`,
    `Routes: ${ROUTES.length} · Viewports: ${VIEWPORTS.map((v) => `${v.label} (${v.width}px, budget ${v.budget}px)`).join(", ")}`,
    `Tolerance: ${TOLERANCE}px · per-route report: test-results/spacing-audit/index.html`,
    "",
  ];
  if (rows.length === 0) {
    lines.push("No gaps over budget on any route at any breakpoint.");
  } else {
    lines.push(
      "| route | viewport | gap | budget | baseline | between |",
      "| --- | --- | --- | --- | --- | --- |",
    );
    for (const r of rows) {
      const prev = baseline.worstGap?.[`${r.route}|${r.viewport}`];
      lines.push(
        `| ${r.route} | ${r.viewport} | ${r.gap}px | ${r.budget}px | ${prev ?? "—"} | ${r.before} → ${r.after} |`,
      );
    }
  }
  if (failures.length > 0) {
    lines.push("", "## Regressions", "", ...failures.map((f) => `- ${f}`));
  }
  if (redirected.length > 0) {
    lines.push("", "## Not measured (redirected)", "", ...redirected.map((r) => `- ${r}`));
  }

  const report = lines.join("\n");
  writeFileSync(path.join(OUT_DIR, "report.md"), `${report}\n`);
  writeFileSync(
    path.join(OUT_DIR, "report.json"),
    JSON.stringify({ base: BASE, tolerance: TOLERANCE, findings: rows, failures, redirected }, null, 2) + "\n",
  );

  if (UPDATE) {
    const worstGap = {};
    for (const [, breakpoints] of perRoute) for (const b of breakpoints) worstGap[b.key] = b.worstGap;
    writeFileSync(BASELINE_FILE, JSON.stringify({ tolerance: TOLERANCE, worstGap }, null, 2) + "\n");
    console.log(`Baseline updated: ${BASELINE_FILE} + ${BASELINE_DIR}/`);
  }

  console.log(report);
  console.log(`\nReport: ${OUT_DIR}/index.html`);

  if (failures.length > 0 && !REPORT_ONLY && !UPDATE) {
    console.error(`\n✗ ${failures.length} new or worsening vertical gap(s).`);
    stopServer();
    process.exit(1);
  }
  console.log("\n✓ no new or worsening vertical whitespace");
  stopServer();
  process.exit(0);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
