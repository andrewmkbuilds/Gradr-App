#!/usr/bin/env node
/**
 * Visual regression for the /auth *states* — the ones a happy-path screenshot
 * never covers and a design-system change can silently flatten:
 *
 *   validation   inline field errors after submitting an empty form
 *   credentials  the destructive alert after a rejected sign-in
 *   loading      the sign-in button while the request is in flight
 *
 * The auth endpoint is stubbed so the states are deterministic (a real 400 and
 * a held-open request), and no account is required.
 *
 *   node scripts/visual-auth-states.mjs             # compare
 *   node scripts/visual-auth-states.mjs --update    # (re)write baselines
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import { launchBrowser } from "./lib/browser.mjs";

const BASE = (process.argv.find((a) => a.startsWith("http")) || process.env.E2E_BASE_URL || "http://localhost:8080").replace(/\/$/, "");
const UPDATE = process.argv.includes("--update");

const BASELINE_DIR = join(process.cwd(), "tests/visual/auth-states/baseline");
const CURRENT_DIR = join(process.cwd(), "tests/visual/auth-states/current");
const DIFF_DIR = join(process.cwd(), "tests/visual/auth-states/diff");
for (const dir of [BASELINE_DIR, CURRENT_DIR, DIFF_DIR]) mkdirSync(dir, { recursive: true });

const TOLERANCE = Number(process.env.AUTH_STATE_VISUAL_TOLERANCE ?? 0.005);
const THRESHOLD = Number(process.env.AUTH_STATE_PIXEL_THRESHOLD ?? 0.12);
const VIEWPORTS = [
  ["mobile", 390, 844],
  ["desktop", 1280, 900],
];
const SCHEMES = ["light", "dark"];

function pixelDiff(baselineBuf, currentBuf, diffPath) {
  const a = PNG.sync.read(baselineBuf);
  const b = PNG.sync.read(currentBuf);
  if (a.width !== b.width || a.height !== b.height) {
    return { ratio: 1, note: `size ${a.width}x${a.height} -> ${b.width}x${b.height}` };
  }
  const diff = new PNG({ width: a.width, height: a.height });
  const changed = pixelmatch(a.data, b.data, diff.data, a.width, a.height, { threshold: THRESHOLD, includeAA: false });
  const ratio = changed / (a.width * a.height);
  if (ratio > TOLERANCE) writeFileSync(diffPath, PNG.sync.write(diff));
  return { ratio, note: `${changed} px` };
}

/** Rejects password grants so the error state is reproducible offline. */
async function stubAuthFailure(context) {
  await context.route("**/auth/v1/token*", (route) =>
    route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({ error: "invalid_grant", error_description: "Invalid login credentials" }),
    }),
  );
}

/** Holds the grant open so the button stays in its pending state. */
async function stubAuthPending(context) {
  await context.route("**/auth/v1/token*", async (route) => {
    await new Promise((r) => setTimeout(r, 8000));
    await route.abort();
  });
}

const fill = async (page) => {
  await page.getByLabel(/email/i).first().fill("visual@gradr.me");
  await page.getByLabel(/password/i).first().fill("Sup3rSecret!23");
};
const submit = (page) => page.getByRole("button", { name: /^sign in$/i }).first();

const STATES = [
  {
    name: "validation-errors",
    async run(page) {
      await page.goto(`${BASE}/auth`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(800);
      await submit(page).click();
      await page.waitForTimeout(600);
    },
  },
  {
    name: "invalid-credentials",
    stub: stubAuthFailure,
    async run(page) {
      await page.goto(`${BASE}/auth`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(800);
      await fill(page);
      await submit(page).click();
      await page.waitForTimeout(1500);
    },
  },
  {
    name: "signin-loading",
    stub: stubAuthPending,
    async run(page) {
      await page.goto(`${BASE}/auth`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(800);
      await fill(page);
      await submit(page).click({ noWaitAfter: true });
      await page.waitForTimeout(700); // captured mid-flight, before the abort lands
    },
  },
];

const failures = [];
const browser = await launchBrowser({ headless: true });
try {
  for (const scheme of SCHEMES) {
    for (const [vp, width, height] of VIEWPORTS) {
      for (const state of STATES) {
        const context = await browser.newContext({
          viewport: { width, height },
          colorScheme: scheme,
          reducedMotion: "reduce",
        });
        if (state.stub) await state.stub(context);
        const page = await context.newPage();
        await state.run(page);

        const file = `${state.name}-${vp}-${scheme}.png`;
        const shot = await page.screenshot();
        const baselinePath = join(BASELINE_DIR, file);
        if (UPDATE || !existsSync(baselinePath)) {
          writeFileSync(baselinePath, shot);
          console.log(`${UPDATE ? "updated" : "created"} baseline ${file}`);
        } else {
          writeFileSync(join(CURRENT_DIR, file), shot);
          const { ratio, note } = pixelDiff(readFileSync(baselinePath), shot, join(DIFF_DIR, file));
          if (ratio > TOLERANCE) {
            failures.push(file);
            console.log(`✖ ${file} differs by ${(ratio * 100).toFixed(2)}% (${note})`);
          } else {
            console.log(`✓ ${file} (${(ratio * 100).toFixed(2)}%)`);
          }
        }
        await context.close();
      }
    }
  }
} finally {
  await browser.close();
}

if (failures.length) {
  console.error(
    `\n${failures.length} auth state capture(s) drifted beyond ${(TOLERANCE * 100).toFixed(1)}%. ` +
      "Diff images: tests/visual/auth-states/diff/. When intended, run: bun run test:visual:auth-states:update",
  );
  process.exit(1);
}
console.log("\n✓ Auth error and loading states are visually stable.");
