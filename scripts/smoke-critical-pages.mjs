#!/usr/bin/env node
/**
 * Playwright smoke tests for Gradr's critical pages.
 *
 * For each route we assert the expected UI actually rendered (a real headline
 * or landmark, not just "something painted"), that no runtime error surfaced,
 * and that neither the loading splash nor the crawler-only SEO fallback was
 * ever visible while the page booted.
 *
 * Usage: node scripts/smoke-critical-pages.mjs [baseUrl]
 */
import { launchBrowser, sampleForFlash } from "./lib/browser.mjs";

const BASE = (process.argv[2] ?? process.env.SMOKE_BASE_URL ?? "http://localhost:8080").replace(/\/$/, "");

/**
 * `expect` matches the rendered text of the route. Gated routes redirect
 * anonymous visitors to /auth, so they accept the auth screen too.
 */
const PAGES = [
  { route: "/", name: "landing", expect: [/gradr/i, /resume|interview|career/i] },
  { route: "/auth", name: "auth", expect: [/sign in|log in|create account|continue with google/i] },
  { route: "/pricing", name: "pricing", expect: [/pricing|plan/i, /monthly|yearly/i] },
  { route: "/dashboard", name: "dashboard", gated: true, expect: [/dashboard|readiness|sign in|continue with google/i] },
  { route: "/resume", name: "resume engine", gated: true, expect: [/resume|sign in|continue with google/i] },
  { route: "/match", name: "match engine", gated: true, expect: [/match|job|sign in|continue with google/i] },
  { route: "/interview", name: "interview engine", gated: true, expect: [/interview|sign in|continue with google/i] },
  { route: "/growth", name: "growth engine", gated: true, expect: [/growth|skill|sign in|continue with google/i] },
];

const IGNORED_CONSOLE = /favicon|net::ERR_|Failed to load resource|^Warning:|React Router Future Flag|Download the React DevTools/i;
const ERROR_FALLBACK = /something broke on our side|application error|unexpected error|something went wrong/i;

const results = [];
function record(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
  console.log(`Critical-page smoke against ${BASE}\n`);
  const browser = await launchBrowser();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  for (const spec of PAGES) {
    const errors = [];
    const onPageError = (e) => errors.push(String(e));
    const onConsole = (m) => { if (m.type() === "error") errors.push(m.text()); };
    page.on("pageerror", onPageError);
    page.on("console", onConsole);

    try {
      const response = await page.goto(`${BASE}${spec.route}`, { waitUntil: "commit", timeout: 30_000 });

      // Sample while it boots — catches splash/SEO flashes a settled
      // screenshot would miss entirely.
      const flash = await sampleForFlash(page, { samples: 25, intervalMs: 60 });

      await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
      const body = (await page.locator("body").innerText().catch(() => "")) ?? "";
      const status = response?.status() ?? 0;

      const missing = spec.expect.filter((re) => !re.test(body));
      const fatal = errors.filter((e) => !IGNORED_CONSOLE.test(e));
      const crashed = ERROR_FALLBACK.test(body)
        || (await page.locator("[data-app-error-screen]").count().catch(() => 0)) > 0;

      const renderOk = status < 400 && missing.length === 0 && !crashed && fatal.length === 0;
      record(
        `${spec.name} (${spec.route}) renders expected UI`,
        renderOk,
        renderOk
          ? `HTTP ${status}${spec.gated ? ` → ${new URL(page.url()).pathname}` : ""}`
          : [
              `status=${status}`,
              missing.length ? `missing ${missing.map(String).join(", ")}` : "",
              crashed ? "error screen" : "",
              fatal.slice(0, 2).join(" | "),
            ].filter(Boolean).join(" · "),
      );

      const flashOk = flash.seoVisibleFrames.length === 0 && !flash.splashStuck;
      record(
        `${spec.name} (${spec.route}) no loading/SEO flash`,
        flashOk,
        flashOk
          ? `clean across ${flash.samples} frames`
          : flash.seoVisibleFrames.length
            ? `SEO fallback painted ("${flash.seoVisibleFrames[0].phrase}")`
            : "splash never dismissed",
      );
    } finally {
      page.off("pageerror", onPageError);
      page.off("console", onConsole);
    }
  }

  await browser.close();

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) {
    console.error(`\nFailed:\n${failed.map((f) => ` - ${f.name}: ${f.detail}`).join("\n")}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Critical-page smoke crashed:", err);
  process.exit(1);
});
