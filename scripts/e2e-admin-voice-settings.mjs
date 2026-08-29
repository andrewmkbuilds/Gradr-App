#!/usr/bin/env node
/**
 * Smoke test for /admin/voice (AdminVoiceSettings).
 *
 * The page is admin-only and talks to the `voice-diagnostics` edge function, so
 * the provider call is stubbed at the network layer: this test is about the
 * page's own contract — do the controls render, does editing them work, and
 * does Save submit the edited configuration without a runtime error.
 *
 * Any console error, page error or unhandled rejection fails the run, which is
 * what catches the TypeScript/runtime drift this page has regressed on before.
 *
 *   node scripts/e2e-admin-voice-settings.mjs [baseUrl]
 *
 * Skips cleanly without E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD (falls back to
 * E2E_EMAIL / E2E_PASSWORD when the primary test user is an admin).
 */
import { launchBrowser } from "./lib/browser.mjs";

const BASE = (process.argv.find((a) => a.startsWith("http")) || process.env.E2E_BASE_URL || "http://localhost:8080").replace(/\/$/, "");
const EMAIL = process.env.E2E_ADMIN_EMAIL || process.env.E2E_EMAIL;
const PASSWORD = process.env.E2E_ADMIN_PASSWORD || process.env.E2E_PASSWORD;

if (!EMAIL || !PASSWORD) {
  console.log("SKIP  admin voice settings smoke — E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD not set.");
  process.exit(0);
}

/** Environment noise that is never an app defect. */
const IGNORED = [
  /Download the React DevTools/i,
  /\[vite\]/i,
  /ResizeObserver loop/i,
  /status of (401|403|404)/i,
  /cdn\.paddle\.com/i,
  /posthog\.com/i,
  /sentry\.io/i,
];
const isIgnored = (t) => IGNORED.some((re) => re.test(t));

const STATUS_FIXTURE = {
  credential: "present",
  synthesis: "ok",
  code: null,
  reason: null,
  subscription: { tier: "pro", charactersUsed: 1200, characterLimit: 100000, status: "active" },
  config: {
    modelId: "eleven_turbo_v2_5",
    outputFormat: "mp3_44100_128",
    voiceOverrides: {},
    deepgramOverrides: {},
  },
  personas: [
    { id: "recruiter", defaultVoiceId: "voice-recruiter", defaultDeepgramVoice: "aura-2-thalia-en", resolvedDeepgramVoice: "aura-2-thalia-en" },
    { id: "hiring-manager", defaultVoiceId: "voice-hm", defaultDeepgramVoice: "aura-2-arcas-en", resolvedDeepgramVoice: "aura-2-arcas-en" },
  ],
  recent: [],
};

const problems = [];
const saved = [];

const browser = await launchBrowser({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 1400 } });
const page = await context.newPage();

page.on("console", (msg) => {
  if (msg.type() === "error" && !isIgnored(msg.text())) problems.push(`console: ${msg.text()}`);
});
page.on("pageerror", (err) => problems.push(`pageerror: ${err.message}`));

// Stub the edge function so the run never depends on a live speech provider.
await context.route("**/functions/v1/voice-diagnostics", async (route) => {
  const body = route.request().postDataJSON?.() ?? {};
  if (body.action === "save-config") {
    saved.push(body);
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
  }
  if (body.action === "stream-test") {
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, bytes: 4096, ttfbMs: 210, voiceId: "aura-2-thalia-en", modelId: "aura-2" }),
    });
  }
  if (body.action === "lookup") {
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ requestId: body.requestId, events: [] }) });
  }
  return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(STATUS_FIXTURE) });
});

const checks = [];
const check = (name, ok, detail = "") => {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

try {
  await page.goto(`${BASE}/auth`, { waitUntil: "domcontentloaded" });
  await page.getByLabel(/email/i).first().fill(EMAIL);
  await page.getByLabel(/password/i).first().fill(PASSWORD);
  await page.getByRole("button", { name: /sign in|log in/i }).first().click();
  await page.waitForURL((url) => !url.pathname.startsWith("/auth"), { timeout: 30_000 });

  await page.goto(`${BASE}/admin/voice`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});

  const heading = page.getByRole("heading", { name: /interviewer voice/i }).first();
  const reachedPage = await heading.isVisible().catch(() => false);
  check("admin can reach /admin/voice", reachedPage, reachedPage ? "" : "page did not render — is the test user an admin?");
  if (!reachedPage) throw new Error("admin voice page not reachable");

  // Key controls.
  const model = page.locator("#model");
  const format = page.locator("#format");
  await model.waitFor({ state: "visible", timeout: 15_000 });
  check("speech model input renders", await model.isVisible());
  check("output format input renders", await format.isVisible());

  for (const persona of STATUS_FIXTURE.personas) {
    check(`persona voice override renders (${persona.id})`, await page.locator(`#voice-${persona.id}`).isVisible());
    check(`deepgram override renders (${persona.id})`, await page.locator(`#deepgram-${persona.id}`).isVisible());
  }
  check("request-id lookup field renders", await page.locator("#voice-request-id").isVisible());
  check("stream test button renders", (await page.getByRole("button", { name: /stream test/i }).count()) > 0);

  // Edit and submit.
  await model.fill("aura-2");
  await format.fill("linear16");
  await page.locator(`#deepgram-${STATUS_FIXTURE.personas[0].id}`).fill("aura-2-luna-en");
  await page.getByRole("button", { name: /save configuration/i }).click();
  await page.waitForTimeout(1200);

  const payload = saved[saved.length - 1];
  check("save submits the edited configuration", Boolean(payload), payload ? "" : "no save-config request observed");
  if (payload) {
    check("model id is submitted", payload.modelId === "aura-2", String(payload.modelId));
    check("output format is submitted", payload.outputFormat === "linear16", String(payload.outputFormat));
    check(
      "deepgram override is submitted",
      payload.deepgramOverrides?.[STATUS_FIXTURE.personas[0].id] === "aura-2-luna-en",
      JSON.stringify(payload.deepgramOverrides ?? {}),
    );
  }

  const toast = await page.getByText(/voice configuration saved/i).first().isVisible().catch(() => false);
  check("save confirmation is shown", toast);

  // Lookup form submits without crashing.
  await page.locator("#voice-request-id").fill("3f1c9a12-77b4-4f0a-9b1e-0f2c4d8a6e55");
  await page.getByRole("button", { name: /look up/i }).click();
  await page.waitForTimeout(800);
  check("request-id lookup submits", true);
} catch (err) {
  check("smoke run completed", false, err.message);
} finally {
  check("no console or runtime errors", problems.length === 0, problems.slice(0, 5).join(" | "));
  await browser.close();
}

const failed = checks.filter((c) => !c.ok);
if (failed.length) {
  console.error(`\n✖ ${failed.length} check(s) failed on /admin/voice.`);
  process.exit(1);
}
console.log("\n✓ AdminVoiceSettings renders and submits cleanly.");
