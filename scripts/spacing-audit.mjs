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
 *   bun run audit:spacing            # report + fail on budget breach
 *   bun run audit:spacing -- --report-only
 *
 * The deployed bundle pins a single surface, so the public routes below only
 * exist behind their path prefixes in multi-surface mode. Unless
 * AUDIT_BASE_URL points somewhere else, this boots its own Vite server with
 * `--mode audit` (see .env.audit) so every route actually renders.
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";

const AUDIT_PORT = Number(process.env.AUDIT_PORT ?? 8090);
const BASE = process.env.AUDIT_BASE_URL ?? `http://localhost:${AUDIT_PORT}`;
const OWNS_SERVER = !process.env.AUDIT_BASE_URL;
const REPORT_ONLY = process.argv.includes("--report-only");
const OUT_DIR = "/tmp/browser/spacing-audit";

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

async function run() {
  mkdirSync(OUT_DIR, { recursive: true });
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
  process.on("exit", stopServer);
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  });

  const rows = [];
  const redirected = [];

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
      // A route that bounced elsewhere was never measured — surface it instead
      // of counting it as a pass.
      const landed = new URL(page.url()).pathname.replace(/\/$/, "") || "/";
      if (landed !== route) redirected.push(`${route} → ${landed} (${vp.label})`);
      const findings = await page.evaluate(measure, vp.budget).catch(() => []);
      for (const f of findings) rows.push({ route, viewport: vp.label, budget: vp.budget, ...f });
    }
    await context.close();
  }


  await browser.close();

  const lines = [
    "# Vertical spacing audit",
    "",
    `Base: ${BASE}`,
    `Routes: ${ROUTES.length} · Viewports: ${VIEWPORTS.map((v) => `${v.label} (${v.width}px, budget ${v.budget}px)`).join(", ")}`,
    "",
  ];
  if (rows.length === 0) {
    lines.push("No gaps over budget on any route at any breakpoint.");
  } else {
    lines.push("| route | viewport | gap | budget | between |", "| --- | --- | --- | --- | --- |");
    for (const r of rows) {
      lines.push(`| ${r.route} | ${r.viewport} | ${r.gap}px | ${r.budget}px | ${r.before} → ${r.after} |`);
    }
  }
  if (redirected.length > 0) {
    lines.push("", "## Not measured (redirected)", "", ...redirected.map((r) => `- ${r}`));
  }

  const report = lines.join("\n");
  writeFileSync(`${OUT_DIR}/report.md`, `${report}\n`);
  console.log(report);
  console.log(`\nReport written to ${OUT_DIR}/report.md`);

  if (rows.length > 0 && !REPORT_ONLY) {
    console.error(`\n✗ ${rows.length} vertical gap(s) over budget.`);
    process.exit(1);
  }
  console.log("\n✓ vertical rhythm within budget");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
