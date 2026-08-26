#!/usr/bin/env node
/**
 * Visual regression for the authenticated core surfaces.
 *
 * `visual-regression.mjs` covers public routes only, so token or layout drift
 * inside the product (Career Dashboard, Resume Intelligence, Interview Coach,
 * Jobs, Pipeline) shipped unnoticed. This captures those routes in light and
 * dark at three widths and diffs each against a committed baseline.
 *
 *   node scripts/visual-key-pages.mjs            # compare
 *   node scripts/visual-key-pages.mjs --update   # (re)write baselines
 *
 * Skips cleanly when E2E_EMAIL / E2E_PASSWORD are missing.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import { launchBrowser } from "./lib/browser.mjs";

const BASE = (process.argv.find((a) => a.startsWith("http")) || process.env.E2E_BASE_URL || "http://localhost:8080").replace(/\/$/, "");
const UPDATE = process.argv.includes("--update");
const EMAIL = process.env.E2E_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD;

if (!EMAIL || !PASSWORD) {
  console.log("SKIP  key-page visual regression — E2E_EMAIL / E2E_PASSWORD not set.");
  process.exit(0);
}

const BASELINE_DIR = join(process.cwd(), "tests/visual/key-pages/baseline");
const CURRENT_DIR = join(process.cwd(), "tests/visual/key-pages/current");
const DIFF_DIR = join(process.cwd(), "tests/visual/key-pages/diff");
/** Fraction of *perceptually different* pixels tolerated before a route fails. */
const TOLERANCE = Number(process.env.KEY_PAGE_VISUAL_TOLERANCE ?? 0.005);
/** Per-pixel colour sensitivity handed to pixelmatch (0 = strictest). */
const THRESHOLD = Number(process.env.KEY_PAGE_PIXEL_THRESHOLD ?? 0.12);

const ROUTES = [
  ["dashboard", "/"],
  ["resume", "/resume"],
  ["interview", "/interview"],
  ["jobs", "/jobs"],
  ["pipeline", "/pipeline"],
];
const VIEWPORTS = [
  ["mobile", 390, 844],
  ["tablet", 834, 1112],
  ["desktop", 1440, 900],
];
const SCHEMES = ["light", "dark"];

mkdirSync(BASELINE_DIR, { recursive: true });
mkdirSync(CURRENT_DIR, { recursive: true });
mkdirSync(DIFF_DIR, { recursive: true });

/**
 * Perceptual diff. A byte comparison flags PNG-encoding noise as a change and
 * misses a same-size palette swap, so anti-aliasing-aware pixel matching is
 * what makes "meaningful diff" mean anything. Writes a diff image on failure.
 */
function pixelDiff(baselineBuf, currentBuf, diffPath) {
  const a = PNG.sync.read(baselineBuf);
  const b = PNG.sync.read(currentBuf);
  if (a.width !== b.width || a.height !== b.height) {
    return { ratio: 1, note: `size ${a.width}x${a.height} -> ${b.width}x${b.height}` };
  }
  const diff = new PNG({ width: a.width, height: a.height });
  const changed = pixelmatch(a.data, b.data, diff.data, a.width, a.height, {
    threshold: THRESHOLD,
    includeAA: false,
  });
  const ratio = changed / (a.width * a.height);
  if (ratio > TOLERANCE) writeFileSync(diffPath, PNG.sync.write(diff));
  return { ratio, note: `${changed} px` };
}

async function signIn(page) {
  await page.goto(`${BASE}/auth`, { waitUntil: "domcontentloaded" });
  await page.getByLabel(/email/i).first().fill(EMAIL);
  await page.getByLabel(/password/i).first().fill(PASSWORD);
  await page.getByRole("button", { name: /sign in|log in/i }).first().click();
  await page.waitForURL((url) => !url.pathname.startsWith("/auth"), { timeout: 30_000 });
}

const failures = [];
const browser = await launchBrowser();
try {
  for (const scheme of SCHEMES) {
    for (const [vp, width, height] of VIEWPORTS) {
      const context = await browser.newContext({
        viewport: { width, height },
        colorScheme: scheme,
        reducedMotion: "reduce", // deterministic captures
      });
      const page = await context.newPage();
      await signIn(page);
      for (const [name, path] of ROUTES) {
        const file = `${name}-${vp}-${scheme}.png`;
        await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(1500);
        const shot = await page.screenshot();

        const baselinePath = join(BASELINE_DIR, file);
        if (UPDATE || !existsSync(baselinePath)) {
          writeFileSync(baselinePath, shot);
          console.log(`${UPDATE ? "updated" : "created"} baseline ${file}`);
          continue;
        }
        writeFileSync(join(CURRENT_DIR, file), shot);
        const { ratio, note } = pixelDiff(readFileSync(baselinePath), shot, join(DIFF_DIR, file));
        if (ratio > TOLERANCE) {
          failures.push({ file, ratio, note });
          console.log(`✖ ${file} differs by ${(ratio * 100).toFixed(2)}% (${note})`);
        } else {
          console.log(`✓ ${file} (${(ratio * 100).toFixed(2)}%)`);
        }
      }
      await context.close();
    }
  }
} finally {
  await browser.close();
}

if (failures.length) {
  console.error(
    `\n${failures.length} capture(s) drifted beyond ${(TOLERANCE * 100).toFixed(0)}%. ` +
      `Diff images: tests/visual/key-pages/diff/. When the change is intended (token or layout update), ` +
      `regenerate every baseline with one command:  bun run test:visual:key-pages:update`,
  );
  process.exit(1);
}
console.log("\n✓ Key-page visual regression clean.");
