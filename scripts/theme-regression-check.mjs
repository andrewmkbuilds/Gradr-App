#!/usr/bin/env node
/**
 * Light/dark theme regression check.
 *
 * 1. Static pass: scans app source (excluding the vendored design system) for
 *    hardcoded colour literals and non-token Tailwind palette utilities that
 *    bypass the design system and therefore cannot react to the theme.
 * 2. Runtime pass: renders key routes in light and dark mode with Playwright
 *    and asserts that the page background, surfaces and text actually change.
 *
 * Usage: node scripts/theme-regression-check.mjs [--static-only]
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { execSync } from "node:child_process";

const BASE = process.env.BASE_URL ?? "http://localhost:8080";
// "/" is the authenticated dashboard, and the marketing routes 302 away on the
// app surface, so the sign-in screen is the stable signed-out sample.
const ROUTES = (process.env.THEME_ROUTES ?? "/auth").split(",");

// Tailwind default palette families that are not design-system tokens.
const PALETTE =
  "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";
const RULES = [
  {
    name: "hex-literal",
    re: /(?:className|class)="[^"]*#[0-9a-fA-F]{3,8}\b[^"]*"|(?:bg|text|border|ring|fill|stroke|from|via|to)-\[#[0-9a-fA-F]{3,8}\]/g,
  },
  {
    name: "raw-color-function",
    re: /(?:bg|text|border|ring|fill|stroke)-\[(?:rgb|rgba|hsl|hsla)\([^\]]*\)\]/g,
  },
  {
    name: "tailwind-palette-utility",
    re: new RegExp(`\\b(?:bg|text|border|ring|fill|stroke|from|via|to)-(?:${PALETTE})-\\d{2,3}\\b`, "g"),
  },
];

const IGNORE = [
  "src/design-system/",
  "src/integrations/supabase/types.ts",
];

function listSourceFiles() {
  const out = execSync(`git ls-files 'src/**/*.tsx' 'src/**/*.ts'`, { encoding: "utf8" });
  return out
    .split("\n")
    .filter(Boolean)
    .filter((f) => !IGNORE.some((p) => f.startsWith(p)));
}

function staticPass() {
  const violations = [];
  for (const file of listSourceFiles()) {
    const src = readFileSync(file, "utf8");
    src.split("\n").forEach((line, i) => {
      if (/theme-regression-ok/.test(line)) return;
      // mask-image gradients use #000/#fff as alpha stops, not theme colours.
      if (/mask-image:/.test(line)) return;
      for (const rule of RULES) {
        rule.re.lastIndex = 0;
        const hit = rule.re.exec(line);
        if (hit) violations.push(`${file}:${i + 1}  [${rule.name}]  ${hit[0].trim()}`);
      }
    });
  }
  return violations;
}

/** Locates a Chromium binary in the sandbox / CI image. */
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

async function runtimePass() {
  const { chromium } = await import("playwright");
  let browser;
  try {
    browser = await chromium.launch({ headless: true, executablePath: findChromium() });
  } catch (err) {
    console.warn("Skipping runtime pass — no Playwright browser available. Run `npx playwright install chromium`.");
    return [];
  }
  const failures = [];
  try {
    for (const route of ROUTES) {
      const samples = {};
      for (const theme of ["light", "dark"]) {
        const context = await browser.newContext({ viewport: { width: 1280, height: 1800 } });
        const page = await context.newPage();
        await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded" });
        // Routes may client-redirect (auth guards, surface pinning); settle first.
        await page.waitForLoadState("networkidle").catch(() => {});
        await page.evaluate((t) => {
          document.documentElement.classList.toggle("dark", t === "dark");
          document.documentElement.style.colorScheme = t;
        }, theme);
        await page.waitForTimeout(400);
        samples[theme] = await page.evaluate(() => {
          const read = (el) => {
            if (!el) return null;
            const cs = getComputedStyle(el);
            return `${cs.backgroundColor}|${cs.color}|${cs.borderColor}`;
          };
          return {
            body: read(document.body),
            heading: read(document.querySelector("h1, h2")),
            surface: read(document.querySelector("[class*='rounded-card'], [class*='rounded-2xl']")),
          };
        });
        await context.close();
      }
      for (const key of Object.keys(samples.light)) {
        const l = samples.light[key];
        const d = samples.dark[key];
        if (!l || !d) continue;
        if (l === d) failures.push(`${route} → "${key}" identical in light and dark (${l})`);
      }
    }
  } finally {
    await browser.close();
  }
  return failures;
}

const staticOnly = process.argv.includes("--static-only");
const staticViolations = staticPass();
const runtimeFailures = staticOnly ? [] : await runtimePass();

if (staticViolations.length) {
  console.error(`\nNon-token colour usage (${staticViolations.length}):`);
  staticViolations.forEach((v) => console.error("  " + v));
}
if (runtimeFailures.length) {
  console.error(`\nTheme-invariant elements (${runtimeFailures.length}):`);
  runtimeFailures.forEach((v) => console.error("  " + v));
}
if (staticViolations.length || runtimeFailures.length) {
  console.error("\nTheme regression check FAILED.");
  process.exit(1);
}
console.log("Theme regression check passed — all sampled surfaces are token-driven.");
