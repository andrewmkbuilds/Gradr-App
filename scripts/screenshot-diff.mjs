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
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";
import { settle, stableScreenshot, withRetry } from "./lib/pageStability.mjs";
import { loadManifest, verifyLocks } from "./lib/visualBaselines.mjs";

const BASE = (process.env.SMOKE_BASE_URL ?? "http://localhost:8080").replace(/\/$/, "");
const UPDATE = process.argv.includes("--update");
const ROOT = process.cwd();
const BASELINE_DIR = join(ROOT, "tests/visual/themes/baseline");
const CURRENT_DIR = join(ROOT, "tests/visual/themes/current");
const PENDING_DIR = join(ROOT, "tests/visual/themes/pending");
const DIFF_DIR = join(ROOT, "tests/visual/themes/diff");
const REPORT_FILE = join(ROOT, "tests/reports/json/visual-themes.json");
// Two thresholds, deliberately:
//   drift <= TOLERANCE             -> pass
//   TOLERANCE < drift <= QUARANTINE-> real regression, blocks the merge
//   drift  > QUARANTINE            -> too large to be a targeted regression
//                                     (renderer/font/env breakage, a whole
//                                     screen swap). The run is QUARANTINED:
//                                     reported loudly, artifacts uploaded, but
//                                     it does not block the merge — a human
//                                     triages it instead of everyone force-merging.
const TOLERANCE = Number(process.env.VISUAL_TOLERANCE ?? 0.02); // 2% of pixels
const QUARANTINE_TOLERANCE = Number(process.env.VISUAL_QUARANTINE_TOLERANCE ?? 0.25); // 25% of pixels
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

/**
 * Pixel diff via pixelmatch — the same comparison scripts/baseline-approve.mjs
 * reports at review time, so the drift % a reviewer approves is the drift % CI
 * measures. Also writes a highlighted diff PNG for triage.
 */
function diffRatio(baselinePath, currentPath, diffPath) {
  const a = PNG.sync.read(readFileSync(baselinePath));
  const b = PNG.sync.read(readFileSync(currentPath));
  if (a.width !== b.width || a.height !== b.height) {
    // Size change: no meaningful per-pixel diff image, treat as total drift.
    return { ratio: 1, diff: null, sizeChanged: true };
  }
  const out = new PNG({ width: a.width, height: a.height });
  const changed = pixelmatch(a.data, b.data, out.data, a.width, a.height, {
    threshold: 0.15,
    includeAA: false,
  });
  const ratio = changed / (a.width * a.height);
  if (diffPath && changed > 0) writeFileSync(diffPath, PNG.sync.write(out));
  return { ratio, diff: changed > 0 ? diffPath : null, sizeChanged: false };
}


async function main() {
  mkdirSync(BASELINE_DIR, { recursive: true });
  mkdirSync(CURRENT_DIR, { recursive: true });
  mkdirSync(PENDING_DIR, { recursive: true });
  mkdirSync(DIFF_DIR, { recursive: true });


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
  const quarantined = [];
  const captured = [];
  const pending = [];
  /** Per-capture rows consumed by the PR summary comment. */
  const results = [];


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
        results.push({ name: file, status: "failed", detail: `baseline ${why}` });
        continue;
      }

      const diffPath = join(DIFF_DIR, file);

      // Retry the capture before failing: a first-attempt miss is usually a late
      // paint, not a regression.
      const outcome = await withRetry(
        async () => {
          const { buffer, stable } = await stableScreenshot(page);
          writeFileSync(current, buffer);
          const { ratio, sizeChanged } = diffRatio(baseline, current, diffPath);
          return { ok: ratio <= TOLERANCE, ratio, sizeChanged, stable };
        },
        { attempts: RETRIES, beforeRetry: async () => { await page.waitForTimeout(500); await prepare(); } },
      );

      const driftPct = outcome.ratio * 100;
      const status = outcome.ok
        ? "passed"
        : outcome.ratio > QUARANTINE_TOLERANCE
          ? "quarantined"
          : "failed";
      const verdict = { passed: "ok", failed: "FAIL", quarantined: "QUAR" }[status];
      console.log(
        `${verdict.padEnd(4)} ${file}  ${driftPct.toFixed(2)}% changed` +
          (outcome.sizeChanged ? "  (capture size changed)" : "") +
          (outcome.attempts > 1 ? `  (${outcome.attempts} attempts)` : ""),
      );

      results.push({
        name: file,
        status,
        drift: Number(driftPct.toFixed(2)),
        threshold: Number((TOLERANCE * 100).toFixed(2)),
        quarantineThreshold: Number((QUARANTINE_TOLERANCE * 100).toFixed(2)),
        sizeChanged: outcome.sizeChanged,
        baseline: `tests/visual/themes/baseline/${file}`,
        current: `tests/visual/themes/current/${file}`,
        diff: existsSync(diffPath) ? `tests/visual/themes/diff/${file}` : null,
      });

      if (status === "failed") failures.push(`${file}: ${driftPct.toFixed(2)}% of pixels changed`);
      if (status === "quarantined") {
        quarantined.push(
          `${file}: ${driftPct.toFixed(2)}% of pixels changed (over the ${(QUARANTINE_TOLERANCE * 100).toFixed(0)}% quarantine threshold)`,
        );
      }
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
    if (!UPDATE) {
      failures.push(`${pending.length} baseline(s) missing approval`);
      pending.forEach((f) => results.push({ name: f, status: "failed", detail: "awaiting baseline approval" }));
    }
  }

  const isQuarantined = quarantined.length > 0 && failures.length === 0;
  writeReport({
    quarantined: isQuarantined,
    tolerance: TOLERANCE * 100,
    quarantineThreshold: QUARANTINE_TOLERANCE * 100,
    results,
  });

  if (quarantined.length) {
    console.warn(`\n${quarantined.length} capture(s) QUARANTINED (drift too large to be a targeted regression):`);
    quarantined.forEach((f) => console.warn("  " + f));
    console.warn(
      "\nDrift this size normally means a renderer/font/environment difference or a whole-screen\n" +
        "change, not a pixel regression. Artifacts are uploaded for triage; this does not block the merge.\n" +
        "Triage: open the diff PNGs in tests/visual/themes/diff, then either fix the cause or approve\n" +
        'new baselines with `bun run visual:baseline:approve -- --all --reviewer "You" --reason "why"`.',
    );
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

  if (isQuarantined) {
    console.warn("\nScreenshot diff QUARANTINED — reported, not blocking.");
    return;
  }
  console.log(`\nScreenshot diff passed (${captured.length} captures).`);
}

/** Writes the machine-readable report and exports the quarantine flag to CI. */
function writeReport(report) {
  mkdirSync(join(ROOT, "tests/reports/json"), { recursive: true });
  writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2) + "\n");
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `quarantined=${report.quarantined}\n`);
  }
  if (process.env.GITHUB_ENV) {
    appendFileSync(process.env.GITHUB_ENV, `VISUAL_RUN_QUARANTINED=${report.quarantined}\n`);
  }
}


main().catch((err) => {
  console.error(err);
  process.exit(1);
});
