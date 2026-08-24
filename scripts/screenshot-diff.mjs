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

const BASE = (process.env.SMOKE_BASE_URL ?? "http://localhost:8080").replace(/\/$/, "");
const UPDATE = process.argv.includes("--update");
const ROOT = process.cwd();
const BASELINE_DIR = join(ROOT, "tests/visual/themes/baseline");
const CURRENT_DIR = join(ROOT, "tests/visual/themes/current");
const TOLERANCE = Number(process.env.VISUAL_TOLERANCE ?? 0.02); // 2% of pixels

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

  const auth = loadSession();
  const routes = [...PUBLIC_ROUTES, ...(auth ? AUTHED_ROUTES : [])];
  if (!auth) {
    console.warn("No Supabase session available — capturing public routes only (dashboard skipped).");
  }

  const browser = await chromium.launch({ headless: true, executablePath: findChromium() });
  const failures = [];
  const captured = [];

  for (const theme of THEMES) {
    const context = await browser.newContext({ viewport: VIEWPORT, colorScheme: theme });
    const page = await context.newPage();

    if (auth) {
      const cookies = JSON.parse(auth.cookies ?? "[]").map((c) => ({ ...c, url: BASE }));
      if (cookies.length) await context.addCookies(cookies);
      await page.goto(BASE, { waitUntil: "domcontentloaded" });
      await page.evaluate(
        ([k, v]) => window.localStorage.setItem(k, v),
        [auth.storageKey, auth.session],
      );
    }

    for (const [name, route] of routes) {
      await page.goto(`${BASE}${route}`, { waitUntil: "networkidle" });
      await page.evaluate((t) => {
        document.documentElement.classList.toggle("dark", t === "dark");
        document.documentElement.style.colorScheme = t;
        // Freeze motion so captures are deterministic.
        const style = document.createElement("style");
        style.textContent = "*,*::before,*::after{animation:none!important;transition:none!important}";
        document.head.appendChild(style);
      }, theme);
      await page.waitForTimeout(600);

      const file = `${name}-${theme}.png`;
      const current = join(CURRENT_DIR, file);
      await page.screenshot({ path: current });
      captured.push(file);

      const baseline = join(BASELINE_DIR, file);
      if (UPDATE || !existsSync(baseline)) {
        writeFileSync(baseline, readFileSync(current));
        console.log(`${UPDATE ? "updated" : "created"} baseline ${file}`);
        continue;
      }
      const ratio = await diffRatio(page, baseline, current);
      const verdict = ratio > TOLERANCE ? "FAIL" : "ok";
      console.log(`${verdict.padEnd(4)} ${file}  ${(ratio * 100).toFixed(2)}% changed`);
      if (ratio > TOLERANCE) failures.push(`${file}: ${(ratio * 100).toFixed(2)}% of pixels changed`);
    }

    await context.close();
  }

  await browser.close();

  if (failures.length) {
    console.error(`\nScreenshot diff FAILED (${failures.length}):`);
    failures.forEach((f) => console.error("  " + f));
    console.error(`\nInspect tests/visual/themes/current vs baseline. Accept with --update.`);
    process.exit(1);
  }
  console.log(`\nScreenshot diff passed (${captured.length} captures).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
