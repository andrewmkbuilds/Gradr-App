#!/usr/bin/env node
/**
 * Theme screenshot diff.
 *
 * Captures the key app screens in light and dark mode and diffs every capture
 * against a committed baseline, so unintended visual drift (spacing, colour,
 * component swaps) fails a PR instead of shipping.
 *
 * Note: Gradr has no public landing page any more — "/" is the authenticated
 * dashboard and signed-out visitors are redirected to /auth. The suite
 * therefore covers the sign-in screen plus the dashboard shell; the dashboard
 * captures are only taken when a Supabase session is available in the
 * environment (LOVABLE_BROWSER_SUPABASE_* or ~/.cache/lovable-auth/session.json).
 *
 *   node scripts/screenshot-diff.mjs --update   # (re)write baselines
 *   node scripts/screenshot-diff.mjs            # compare against baselines
 */
import { chromium } from "playwright";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { settle, stableScreenshot, withRetry } from "./lib/pageStability.mjs";
import { loadManifest, verifyLocks } from "./lib/visualBaselines.mjs";

const BASE = (process.env.SMOKE_BASE_URL ?? "http://localhost:8080").replace(/\/$/, "");
const UPDATE = process.argv.includes("--update");
const ROOT = process.cwd();
const BASELINE_DIR = join(ROOT, "tests/visual/themes/baseline");
const CURRENT_DIR = join(ROOT, "tests/visual/themes/current");
const PENDING_DIR = join(ROOT, "tests/visual/themes/pending");
const TOLERANCE = Number(process.env.VISUAL_TOLERANCE ?? 0.02); // 2% of pixels
const RETRIES = Number(process.env.VISUAL_RETRIES ?? 3);

const PUBLIC_ROUTES = [["auth", "/auth"]];
const AUTHED_ROUTES = [
  ["dashboard", "/"],
  ["pipeline", "/pipeline"],
];
const THEMES = ["light", "dark"];
const VIEWPORT = { width: 1280, height: 900 };

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

function loadSession() {
  const key = process.env.LOVABLE_BROWSER_SUPABASE_STORAGE_KEY;
  const session = process.env.LOVABLE_BROWSER_SUPABASE_SESSION_JSON;
  if (key && session) return { storageKey: key, session, cookies: process.env.LOVABLE_BROWSER_SUPABASE_COOKIES_JSON };
  const file = join(homedir(), ".cache/lovable-auth/session.json");
  if (!existsSync(file)) return null;
  const minted = JSON.parse(readFileSync(file, "utf8"));
  return {
    storageKey: minted.storage_key,
    session: JSON.stringify(minted.session),
    cookies: JSON.stringify(minted.cookies ?? []),
  };
}

/** Cheap pixel diff on raw PNG bytes decoded via the browser itself. */
async function diffRatio(page, aPath, bPath) {
  const a = readFileSync(aPath).toString("base64");
  const b = readFileSync(bPath).toString("base64");
  return page.evaluate(
    async ([a, b]) => {
      const load = (data) =>
        new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = reject;
          img.src = `data:image/png;base64,${data}`;
        });
      const [ia, ib] = await Promise.all([load(a), load(b)]);
      if (ia.width !== ib.width || ia.height !== ib.height) return 1;
      const draw = (img) => {
        const c = document.createElement("canvas");
        c.width = img.width;
        c.height = img.height;
        c.getContext("2d").drawImage(img, 0, 0);
        return c.getContext("2d").getImageData(0, 0, img.width, img.height).data;
      };
      const da = draw(ia);
      const db = draw(ib);
      let changed = 0;
      for (let i = 0; i < da.length; i += 4) {
        if (
          Math.abs(da[i] - db[i]) > 8 ||
          Math.abs(da[i + 1] - db[i + 1]) > 8 ||
          Math.abs(da[i + 2] - db[i + 2]) > 8
        ) {
          changed++;
        }
      }
      return changed / (da.length / 4);
    },
    [a, b],
  );
}

async function main() {
  mkdirSync(BASELINE_DIR, { recursive: true });
  mkdirSync(CURRENT_DIR, { recursive: true });
  mkdirSync(PENDING_DIR, { recursive: true });

  const manifest = loadManifest(ROOT);

  const auth = loadSession();
  if (!auth) {
    console.warn("No Supabase session available — capturing public routes only (dashboard skipped).");
  }

  // Public routes are captured signed OUT on purpose: with a session present the
  // app redirects /auth to the dashboard, which would silently rebaseline the
  // sign-in capture as a dashboard screenshot.
  const groups = [
    { routes: PUBLIC_ROUTES, session: null },
    ...(auth ? [{ routes: AUTHED_ROUTES, session: auth }] : []),
  ];

  const browser = await chromium.launch({ headless: true, executablePath: findChromium() });
  const failures = [];
  const captured = [];
  const pending = [];

  for (const theme of THEMES) {
  for (const group of groups) {
    const context = await browser.newContext({ viewport: VIEWPORT, colorScheme: theme });
    const page = await context.newPage();

    if (group.session) {
      const cookies = JSON.parse(group.session.cookies ?? "[]").map((c) => ({ ...c, url: BASE }));
      if (cookies.length) await context.addCookies(cookies);
      await page.goto(BASE, { waitUntil: "domcontentloaded" });
      await page.evaluate(
        ([k, v]) => window.localStorage.setItem(k, v),
        [group.session.storageKey, group.session.session],
      );
    }

    for (const [name, route] of group.routes) {
      const prepare = async () => {
        await page.evaluate((t) => {
          document.documentElement.classList.toggle("dark", t === "dark");
          document.documentElement.style.colorScheme = t;
        }, theme);
        // Fonts, images, animations and scroll position all settled before we shoot.
        await settle(page);
      };

      await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded" });
      await prepare();

      const file = `${name}-${theme}.png`;
      const current = join(CURRENT_DIR, file);
      captured.push(file);

      const baseline = join(BASELINE_DIR, file);

      // Baselines are never rewritten in place: a candidate goes to pending/ and
      // only becomes the baseline once a human approves and locks it with
      // scripts/baseline-approve.mjs. That review step is what makes a later
      // regression easy to triage — every baseline has an owner and a reason.
      if (UPDATE || !existsSync(baseline)) {
        const { buffer } = await stableScreenshot(page);
        writeFileSync(current, buffer);
        writeFileSync(join(PENDING_DIR, file), buffer);
        pending.push(file);
        console.log(`pending review: ${file} (${existsSync(baseline) ? "candidate update" : "new capture"})`);
        continue;
      }

      // An unapproved edit to a committed baseline is itself a failure.
      const lock = verifyLocks([file], { root: ROOT, manifest });
      if (lock.unlocked.length || lock.mismatched.length) {
        const why = lock.unlocked.length ? "never approved" : "edited without approval";
        console.log(`FAIL ${file}  baseline lock: ${why}`);
        failures.push(`${file}: baseline ${why} — run 'bun run visual:baseline:review'`);
        continue;
      }

      // Retry the capture before failing: a first-attempt miss is usually a late
      // paint, not a regression.
      const outcome = await withRetry(
        async () => {
          const { buffer, stable } = await stableScreenshot(page);
          writeFileSync(current, buffer);
          const ratio = await diffRatio(page, baseline, current);
          return { ok: ratio <= TOLERANCE, ratio, stable };
        },
        { attempts: RETRIES, beforeRetry: async () => { await page.waitForTimeout(500); await prepare(); } },
      );

      const verdict = outcome.ok ? "ok" : "FAIL";
      console.log(
        `${verdict.padEnd(4)} ${file}  ${(outcome.ratio * 100).toFixed(2)}% changed` +
          (outcome.attempts > 1 ? `  (${outcome.attempts} attempts)` : ""),
      );
      if (!outcome.ok) failures.push(`${file}: ${(outcome.ratio * 100).toFixed(2)}% of pixels changed`);
    }

    await context.close();
  }
  }

  await browser.close();

  if (pending.length) {
    console.log(`\n${pending.length} capture(s) awaiting review in tests/visual/themes/pending:`);
    pending.forEach((f) => console.log("  " + f));
    console.log(
      "\nReview them, then lock:\n" +
        "  bun run visual:baseline:review\n" +
        '  bun run visual:baseline:approve -- --all --reviewer "Your Name" --reason "why"',
    );
    if (!UPDATE) failures.push(`${pending.length} baseline(s) missing approval`);
  }

  if (failures.length) {
    console.error(`\nScreenshot diff FAILED (${failures.length}):`);
    failures.forEach((f) => console.error("  " + f));
    console.error(
      `\nInspect tests/visual/themes/current vs baseline. Propose new baselines with --update, ` +
        `then approve them with 'bun run visual:baseline:approve'.`,
    );
    process.exit(1);
  }
  console.log(`\nScreenshot diff passed (${captured.length} captures).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
