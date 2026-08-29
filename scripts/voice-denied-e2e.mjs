#!/usr/bin/env node
/**
 * Interview device-permission-denied end-to-end test.
 *
 * Proves that a blocked camera/microphone is a recoverable state, not a dead
 * end:
 *   1. signs in
 *   2. opens the interview preflight with media permissions DENIED
 *   3. asserts the preflight surfaces the "blocked" error state
 *   4. asserts the "Continue in text mode" fallback is offered and works
 *   5. asserts the session actually starts and accepts a typed answer
 *
 * Usage:
 *   VOICE_E2E_EMAIL=... VOICE_E2E_PASSWORD=... node scripts/voice-denied-e2e.mjs [baseUrl]
 */
import { chromium } from "playwright";
import { existsSync, readdirSync } from "fs";
import { join } from "path";

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
  // No --use-fake-ui-for-media-stream here: we WANT getUserMedia to be refused.
  const args = ["--autoplay-policy=no-user-gesture-required"];
  try {
    return await chromium.launch({ args });
  } catch (err) {
    const executablePath = findChromium();
    if (!executablePath) throw err;
    return chromium.launch({ args, executablePath });
  }
}

const BASE = (process.argv[2] ?? process.env.VOICE_E2E_BASE_URL ?? "http://localhost:8080").replace(/\/$/, "");
const EMAIL = process.env.VOICE_E2E_EMAIL;
const PASSWORD = process.env.VOICE_E2E_PASSWORD;

if (!EMAIL || !PASSWORD) {
  console.error("voice-denied-e2e: VOICE_E2E_EMAIL and VOICE_E2E_PASSWORD are required.");
  process.exit(1);
}

const failures = [];
const fail = (msg) => {
  failures.push(msg);
  console.error(`  ✗ ${msg}`);
};
const pass = (msg) => console.log(`  ✓ ${msg}`);

const run = async () => {
  const browser = await launchBrowser();
  const context = await browser.newContext({ viewport: { width: 1280, height: 1800 } });
  // Hard-deny both devices for this origin.
  await context.clearPermissions();
  await context.grantPermissions([], { origin: BASE });
  const page = await context.newPage();

  // Belt and braces: some Chromium builds auto-resolve in headless mode, so
  // force the rejection the browser would produce on a real denial.
  await page.addInitScript(() => {
    if (!navigator.mediaDevices) return;
    navigator.mediaDevices.getUserMedia = () => {
      const err = new Error("Permission denied");
      err.name = "NotAllowedError";
      return Promise.reject(err);
    };
  });

  console.log(`voice-denied-e2e against ${BASE}`);

  // ---- 1. sign in ----------------------------------------------------------
  await page.goto(`${BASE}/auth`, { waitUntil: "domcontentloaded" });
  await page.getByLabel(/email/i).first().fill(EMAIL);
  await page.getByLabel(/password/i).first().fill(PASSWORD);
  await page.getByRole("button", { name: /sign in|log in/i }).first().click();
  await page.waitForURL((url) => !url.pathname.startsWith("/auth"), { timeout: 30_000 }).catch(() => {
    fail("sign-in did not leave /auth");
  });
  if (!failures.length) pass("signed in");

  // ---- 2. reach the preflight ---------------------------------------------
  await page.goto(`${BASE}/interview`, { waitUntil: "domcontentloaded" });
  const startButton = page.getByRole("button", { name: /start (the )?(mock )?interview|begin/i }).first();
  await startButton.waitFor({ timeout: 20_000 }).catch(() => fail("interview start control never appeared"));
  await startButton.click().catch(() => fail("could not open the preflight"));

  // ---- 3. the blocked state is shown --------------------------------------
  const error = page.getByTestId("preflight-error");
  await error.waitFor({ timeout: 20_000 }).catch(() => fail("preflight never showed a device error"));
  const errorText = (await error.textContent().catch(() => "")) ?? "";
  if (!/blocked|couldn't reach/i.test(errorText)) {
    fail(`preflight error copy did not explain the block: "${errorText.trim().slice(0, 120)}"`);
  } else {
    pass("preflight surfaced the permission-denied state");
  }

  const startDisabled = await page
    .getByRole("button", { name: /waiting for camera & mic|start interview/i })
    .first()
    .isDisabled()
    .catch(() => false);
  if (!startDisabled) fail("the camera/mic start button was not disabled while devices are blocked");
  else pass("voice start is correctly disabled");

  // ---- 4. text-mode fallback ----------------------------------------------
  const fallback = page.getByTestId("preflight-start-text");
  const fallbackVisible = await fallback.isVisible().catch(() => false);
  if (!fallbackVisible) {
    fail("no 'Continue in text mode' fallback was offered — the flow dead-ends");
  } else {
    pass("text-mode fallback offered");
    await fallback.click();
  }

  // ---- 5. the session runs in text mode -----------------------------------
  if (fallbackVisible) {
    const composer = page.getByPlaceholder(/type|answer/i).first();
    await composer.waitFor({ timeout: 30_000 }).catch(() => fail("text composer never appeared after the fallback"));
    if (await composer.isVisible().catch(() => false)) {
      await composer.fill("I led a migration that cut our p95 latency in half.");
      await page.keyboard.press("Enter");
      await page
        .getByText(/cut our p95 latency in half/i)
        .first()
        .waitFor({ timeout: 30_000 })
        .catch(() => fail("the typed answer never made it into the transcript"));
      if (!failures.some((f) => f.includes("transcript"))) pass("typed answer accepted in text mode");
    }
  }

  await browser.close();
};

run()
  .then(() => {
    if (failures.length) {
      console.error(`\nvoice-denied-e2e FAILED — ${failures.length} problem(s)`);
      process.exit(1);
    }
    console.log("\nvoice-denied-e2e passed");
  })
  .catch((err) => {
    console.error("voice-denied-e2e crashed:", err);
    process.exit(1);
  });
