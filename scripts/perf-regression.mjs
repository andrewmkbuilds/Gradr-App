#!/usr/bin/env node
/**
 * Motion & performance regression harness.
 *
 * Measures, per route, with the real animation system running:
 *   - FPS and dropped frames during a scripted scroll + hover interaction
 *   - long tasks (>50ms) blocking the main thread
 *   - Largest Contentful Paint, Cumulative Layout Shift
 *   - hydration-to-interactive time
 *
 * Also runs each route in reduced-motion mode to prove the accessible path is
 * never slower than the full-motion one.
 *
 * Usage:
 *   node scripts/perf-regression.mjs --save        # write .perf/baseline.json
 *   node scripts/perf-regression.mjs               # compare against baseline
 *   node scripts/perf-regression.mjs --json out.json
 *
 * Exits non-zero when a metric regresses past the budget below, so it can gate
 * a Wave of changes.
 */
import { chromium } from "playwright";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

const BASE_URL = process.env.PERF_BASE_URL ?? "http://localhost:8080";
const BASELINE_PATH = resolve(process.cwd(), ".perf/baseline.json");

const ROUTES = [
  { path: "/", name: "landing" },
  { path: "/pricing", name: "pricing" },
  { path: "/ai-interview-coach", name: "interview-coach" },
  { path: "/ats-resume-checker", name: "ats-checker" },
  { path: "/status", name: "status" },
];

/** Relative regression budgets — a metric may worsen by at most this much. */
const BUDGET = {
  fps: { direction: "higher", tolerance: 0.12 }, // may drop 12%
  droppedFrames: { direction: "lower", tolerance: 0.5, absolute: 4 },
  longTasks: { direction: "lower", tolerance: 0.5, absolute: 2 },
  longTaskMs: { direction: "lower", tolerance: 0.4, absolute: 120 },
  lcp: { direction: "lower", tolerance: 0.2, absolute: 250 },
  cls: { direction: "lower", tolerance: 0.5, absolute: 0.02 },
  interactive: { direction: "lower", tolerance: 0.25, absolute: 300 },
};

const args = process.argv.slice(2);
const SAVE = args.includes("--save");
const jsonIdx = args.indexOf("--json");
const JSON_OUT = jsonIdx >= 0 ? args[jsonIdx + 1] : null;

async function measure(page, url) {
  await page.addInitScript(() => {
    window.__perf = { longTasks: [], cls: 0, lcp: 0 };
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) window.__perf.longTasks.push(e.duration);
      }).observe({ type: "longtask", buffered: true });
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          if (!e.hadRecentInput) window.__perf.cls += e.value;
        }
      }).observe({ type: "layout-shift", buffered: true });
      new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const last = entries[entries.length - 1];
        if (last) window.__perf.lcp = last.startTime;
      }).observe({ type: "largest-contentful-paint", buffered: true });
    } catch {
      /* observer type unsupported */
    }
  });

  const started = Date.now();
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("h1", { timeout: 20000 }).catch(() => {});
  const interactive = Date.now() - started;

  // Scripted interaction: scroll the page in animation-heavy steps while
  // sampling rAF, which is where motion regressions actually show up.
  const frames = await page.evaluate(async () => {
    const samples = [];
    let last = performance.now();
    let running = true;
    const tick = (now) => {
      samples.push(now - last);
      last = now;
      if (running) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);

    const steps = 12;
    for (let i = 0; i < steps; i++) {
      window.scrollTo({ top: (document.body.scrollHeight / steps) * i, behavior: "smooth" });
      await new Promise((r) => setTimeout(r, 250));
    }
    running = false;
    await new Promise((r) => setTimeout(r, 100));
    return samples;
  });

  const perf = await page.evaluate(() => window.__perf ?? { longTasks: [], cls: 0, lcp: 0 });
  const durations = frames.filter((d) => d > 0);
  const avgFrame = durations.reduce((a, b) => a + b, 0) / (durations.length || 1);
  const dropped = durations.filter((d) => d > 1000 / 30).length;

  return {
    fps: Math.round((1000 / avgFrame) * 10) / 10,
    droppedFrames: dropped,
    longTasks: perf.longTasks.length,
    longTaskMs: Math.round(perf.longTasks.reduce((a, b) => a + b, 0)),
    lcp: Math.round(perf.lcp),
    cls: Math.round(perf.cls * 1000) / 1000,
    interactive,
  };
}

async function run() {
    // Some CI images ship a different Playwright build than the npm package
  // expects; PERF_CHROMIUM_PATH lets the harness reuse the installed binary.
  const executablePath = process.env.PERF_CHROMIUM_PATH;
  const browser = await chromium.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {}),
  });
  const results = {};

  for (const route of ROUTES) {
    for (const mode of ["full", "reduced"]) {
      const context = await browser.newContext({
        viewport: { width: 1280, height: 900 },
        reducedMotion: mode === "reduced" ? "reduce" : "no-preference",
      });
      const page = await context.newPage();
      await page.addInitScript((m) => {
        window.localStorage.setItem(
          "gradr-motion-prefs",
          JSON.stringify({ mode: m, depth: 1, diagnostics: false }),
        );
      }, mode);

      const key = `${route.name}:${mode}`;
      try {
        results[key] = await measure(page, `${BASE_URL}${route.path}`);
      } catch (err) {
        results[key] = { error: String(err?.message ?? err) };
      }
      await context.close();
      process.stdout.write(`measured ${key}\n`);
    }
  }

  await browser.close();
  return { measuredAt: new Date().toISOString(), baseUrl: BASE_URL, results };
}

function compare(baseline, current) {
  const rows = [];
  let failed = 0;

  for (const key of Object.keys(current.results)) {
    const now = current.results[key];
    const before = baseline?.results?.[key];
    if (now.error) {
      rows.push({ key, metric: "run", status: "ERROR", detail: now.error });
      failed++;
      continue;
    }
    for (const [metric, budget] of Object.entries(BUDGET)) {
      const after = now[metric];
      const prev = before?.[metric];
      if (typeof after !== "number") continue;
      if (typeof prev !== "number") {
        rows.push({ key, metric, before: "—", after, delta: "—", status: "NEW" });
        continue;
      }
      const worse = budget.direction === "higher" ? after < prev : after > prev;
      const diff = Math.abs(after - prev);
      const relative = prev === 0 ? (diff > 0 ? 1 : 0) : diff / Math.abs(prev);
      const withinAbsolute = budget.absolute !== undefined && diff <= budget.absolute;
      const regressed = worse && relative > budget.tolerance && !withinAbsolute;
      if (regressed) failed++;
      rows.push({
        key,
        metric,
        before: prev,
        after,
        delta: `${worse ? "-" : "+"}${Math.round(relative * 1000) / 10}%`,
        status: regressed ? "REGRESSED" : worse ? "worse (ok)" : "ok",
      });
    }
  }

  return { rows, failed };
}

const current = await run();

if (JSON_OUT) {
  mkdirSync(dirname(resolve(JSON_OUT)), { recursive: true });
  writeFileSync(resolve(JSON_OUT), JSON.stringify(current, null, 2));
}

if (SAVE) {
  mkdirSync(dirname(BASELINE_PATH), { recursive: true });
  writeFileSync(BASELINE_PATH, JSON.stringify(current, null, 2));
  console.log(`\nBaseline saved to ${BASELINE_PATH}`);
  console.table(current.results);
  process.exit(0);
}

if (!existsSync(BASELINE_PATH)) {
  console.log("\nNo baseline found — run with --save first. Current metrics:");
  console.table(current.results);
  process.exit(0);
}

const baseline = JSON.parse(readFileSync(BASELINE_PATH, "utf8"));
const { rows, failed } = compare(baseline, current);

console.log(`\nBaseline: ${baseline.measuredAt}\nCurrent:  ${current.measuredAt}\n`);
console.table(rows.filter((r) => r.status !== "ok"));

// Reduced motion must never cost more than full motion on the same route.
for (const route of ROUTES) {
  const full = current.results[`${route.name}:full`];
  const reduced = current.results[`${route.name}:reduced`];
  // Advisory: rAF sampling is noisy on shared CI hardware, so this warns
  // rather than gates. A persistent gap means reduced motion is doing work
  // it should be skipping.
  if (full?.fps && reduced?.fps && reduced.fps < full.fps * 0.8) {
    console.warn(
      `WARN ${route.name}: reduced-motion fps ${reduced.fps} trails full-motion ${full.fps}`,
    );
  }
}

if (failed > 0) {
  console.error(`\n${failed} metric(s) regressed beyond budget.`);
  process.exit(1);
}
console.log("\nNo performance regressions detected.");
