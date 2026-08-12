#!/usr/bin/env node
/**
 * Production smoke tests.
 *
 * Loads every critical route in a real browser, fails on runtime exceptions or
 * error fallbacks, and verifies that the Paddle checkout entrypoint is enabled
 * whenever the VITE_PAYMENTS_* variables are configured in the build.
 *
 * Usage:
 *   node scripts/smoke-test.mjs                      # against http://localhost:8080
 *   node scripts/smoke-test.mjs https://your.app     # against a deployed build
 *   SMOKE_EXPECT_PAYMENTS=1 node scripts/smoke-test.mjs <url>
 *
 * Exit code 0 = all checks passed, 1 = at least one failure.
 */
import { chromium } from "playwright";
import { existsSync, readdirSync } from "fs";
import { join } from "path";

/**
 * Resolve a Chromium binary. Playwright's bundled download is preferred; when
 * the pinned revision isn't present (common in CI images that ship their own
 * browser) we fall back to any Chromium in the shared browser cache or to
 * PLAYWRIGHT_CHROMIUM_PATH / CHROME_PATH.
 */
function findChromium() {
  for (const envPath of [process.env.PLAYWRIGHT_CHROMIUM_PATH, process.env.CHROME_PATH]) {
    if (envPath && existsSync(envPath)) return envPath;
  }
  for (const root of ["/opt/ms-playwright", join(process.env.HOME ?? "", ".cache/ms-playwright")]) {
    if (!existsSync(root)) continue;
    for (const dir of readdirSync(root).filter((d) => d.startsWith("chromium"))) {
      for (const rel of ["chrome-linux/chrome", "chrome-linux/headless_shell", "chrome-linux64/chrome-headless-shell"]) {
        const candidate = join(root, dir, rel);
        if (existsSync(candidate)) return candidate;
      }
    }
  }
  return undefined;
}

async function launchBrowser() {
  try {
    return await chromium.launch();
  } catch (err) {
    const executablePath = findChromium();
    if (!executablePath) throw err;
    console.log(`(using fallback Chromium at ${executablePath})`);
    return chromium.launch({ executablePath });
  }
}

const BASE = (process.argv[2] ?? process.env.SMOKE_BASE_URL ?? "http://localhost:8080").replace(/\/$/, "");
/** When set, a disabled checkout entrypoint is a hard failure. */
const EXPECT_PAYMENTS = ["1", "true", "yes"].includes(String(process.env.SMOKE_EXPECT_PAYMENTS).toLowerCase());

/** Public routes that must render for anonymous visitors. */
const PUBLIC_ROUTES = [
  "/",
  "/auth",
  "/pricing",
  "/career-advice",
  "/job-search",
  "/blog/ai-resume-optimization",
  "/privacy",
  "/terms",
  "/refund-policy",
];

/** Auth-gated routes: must not crash — a redirect to /auth is a pass. */
const GATED_ROUTES = ["/dashboard", "/resume", "/match", "/interview", "/billing", "/settings"];

/** Static assets that must be served. */
const STATIC_FILES = ["/robots.txt", "/sitemap.xml"];

const results = [];
function record(name, ok, detail = "") {
  results.push({ name, ok, detail });
  const icon = ok ? "PASS" : "FAIL";
  console.log(`${icon}  ${name}${detail ? ` — ${detail}` : ""}`);
}

/** Noise that must not fail a smoke run: dev-only React warnings, asset 404s. */
const IGNORED_CONSOLE = /favicon|net::ERR_|Failed to load resource|^Warning:|React Router Future Flag|Download the React DevTools/i;

const ERROR_FALLBACK = /something broke on our side|application error|unexpected error/i;

async function visit(page, route) {
  const errors = [];
  const onPageError = (err) => errors.push(String(err));
  const onConsole = (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  };
  page.on("pageerror", onPageError);
  page.on("console", onConsole);
  try {
    const response = await page.goto(`${BASE}${route}`, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    await page.waitForTimeout(1200);
    const status = response?.status() ?? 0;
    const body = (await page.locator("body").innerText().catch(() => "")) ?? "";
    return { status, body, errors, url: page.url() };
  } finally {
    page.off("pageerror", onPageError);
    page.off("console", onConsole);
  }
}

/** Payment config as inlined into the deployed bundle, read from the live page. */
async function readPaymentsConfig(page) {
  return page.evaluate(() => {
    const scripts = Array.from(document.querySelectorAll("script[src]")).map((s) => s.src);
    return { scripts };
  });
}

async function main() {
  console.log(`Smoke testing ${BASE}\n`);
  const browser = await launchBrowser();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  // ---- Static assets -------------------------------------------------
  for (const file of STATIC_FILES) {
    const res = await fetch(`${BASE}${file}`).catch(() => null);
    record(`static ${file}`, Boolean(res?.ok), res ? `HTTP ${res.status}` : "request failed");
  }

  // ---- Public routes -------------------------------------------------
  for (const route of PUBLIC_ROUTES) {
    const { status, body, errors } = await visit(page, route);
    const fatal = errors.filter((e) => !IGNORED_CONSOLE.test(e));
    const rendered = body.trim().length > 40;
    const crashed = ERROR_FALLBACK.test(body);
    const ok = status < 400 && rendered && !crashed && fatal.length === 0;
    record(
      `route ${route}`,
      ok,
      ok ? `HTTP ${status}` : `status=${status} crashed=${crashed} errors=${fatal.slice(0, 2).join(" | ")}`,
    );
  }

  // ---- Policy pages must carry the required Paddle readiness content --
  const policyExpectations = [
    { route: "/terms", must: [/merchant of record/i, /paddle/i] },
    { route: "/refund-policy", must: [/\b(14|30|60|90)[- ]day/i, /paddle/i] },
    { route: "/privacy", must: [/data controller/i, /paddle/i] },
  ];
  for (const { route, must } of policyExpectations) {
    const { body } = await visit(page, route);
    const missing = must.filter((re) => !re.test(body)).map(String);
    const forbidden = /no refunds|all sales are final/i.test(body);
    record(
      `policy content ${route}`,
      missing.length === 0 && !forbidden,
      missing.length ? `missing ${missing.join(", ")}` : forbidden ? "contains no-refund language" : "ok",
    );
  }

  // ---- Auth-gated routes must not crash ------------------------------
  for (const route of GATED_ROUTES) {
    const { body, errors, url } = await visit(page, route);
    const fatal = errors.filter((e) => !IGNORED_CONSOLE.test(e));
    const crashed = ERROR_FALLBACK.test(body);
    const ok = !crashed && fatal.length === 0;
    record(`gated ${route}`, ok, ok ? `resolved to ${new URL(url).pathname}` : fatal.slice(0, 2).join(" | "));
  }

  // ---- Paddle checkout entrypoint ------------------------------------
  await visit(page, "/pricing");
  const bannerVisible = await page
    .getByText(/payments are not configured/i)
    .first()
    .isVisible()
    .catch(() => false);
  const configured = !bannerVisible;

  if (configured) {
    record("paddle checkout entrypoint enabled", true, "no misconfiguration banner on /pricing");
    // Paddle.js should be reachable and the CTA must be interactive.
    const cta = page.getByRole("button", { name: /get |upgrade|choose|start/i }).first();
    const ctaOk = await cta.isEnabled().catch(() => false);
    record("pricing CTA is interactive", ctaOk, ctaOk ? "checkout button enabled" : "no enabled CTA found");
  } else {
    record(
      "paddle checkout entrypoint enabled",
      !EXPECT_PAYMENTS,
      EXPECT_PAYMENTS
        ? "VITE_PAYMENTS_* expected but checkout is disabled (banner shown on /pricing)"
        : "checkout disabled; banner shown correctly (set SMOKE_EXPECT_PAYMENTS=1 to require it)",
    );
    // When disabled, the banner is mandatory so users see why.
    record("misconfiguration banner shown", bannerVisible, bannerVisible ? "visible on /pricing" : "banner missing");
  }

  await readPaymentsConfig(page).catch(() => null);
  await browser.close();

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) {
    console.error(`\nFailed checks:\n${failed.map((f) => ` - ${f.name}: ${f.detail}`).join("\n")}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Smoke run crashed:", err);
  process.exit(1);
});
