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
const TOLERANCE = Number(process.env.KEY_PAGE_VISUAL_TOLERANCE ?? 0.04);

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

/** Coarse byte-level difference ratio — enough to catch token/layout drift. */
function differenceRatio(a, b) {
  if (a.length !== b.length) return 1;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) diff += 1;
  return diff / a.length;
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
        const ratio = differenceRatio(readFileSync(baselinePath), shot);
        if (ratio > TOLERANCE) {
          failures.push({ file, ratio });
          console.log(`✖ ${file} differs by ${(ratio * 100).toFixed(1)}%`);
        } else {
          console.log(`✓ ${file}`);
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
      `Compare tests/visual/key-pages/current/ against baseline/, then re-run with --update once intended.`,
  );
  process.exit(1);
}
console.log("\n✓ Key-page visual regression clean.");
