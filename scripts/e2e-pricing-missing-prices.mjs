#!/usr/bin/env node
/**
 * E2E: the pricing page when the Paddle catalog has no products in the active
 * environment.
 *
 * This is the exact shape of the live-launch failure we keep hitting: the
 * client token and the resolver are both healthy, but `get-paddle-price`
 * returns an empty `paddleIds` map because the products have not been created
 * or synced in that environment. Before the catalog preflight the page looked
 * completely normal and the visitor only discovered the problem when the
 * checkout overlay died.
 *
 * The resolver is stubbed at the network boundary so the assertion holds in
 * any environment, including a sandbox whose catalog is fully seeded.
 *
 * Asserts:
 *   1. the "not available yet" callout renders,
 *   2. subscribe CTAs for the missing plans are disabled,
 *   3. plans keep showing a price (never a blank card),
 *   4. no console errors are produced — an operational state must not be
 *      reported as a JavaScript fault.
 *
 * Usage: node scripts/e2e-pricing-missing-prices.mjs [baseUrl]
 */
import { launchBrowser } from "./lib/browser.mjs";
import { partitionConsoleMessages, describeIgnored } from "./lib/console-allowlist.mjs";

const BASE = (process.argv[2] ?? process.env.SMOKE_BASE_URL ?? "http://localhost:8080").replace(/\/$/, "");
const results = [];

function record(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

/** Stubs get-paddle-price with a given resolved map, echoing the missing ids. */
async function stubResolver(page, resolved) {
  await page.route("**/functions/v1/get-paddle-price", async (route) => {
    let requested = [];
    try {
      const body = JSON.parse(route.request().postData() ?? "{}");
      requested = body.priceIds ?? (body.priceId ? [body.priceId] : []);
    } catch {
      /* ignore malformed body — treat as empty request */
    }
    const paddleIds = {};
    for (const id of requested) if (resolved[id]) paddleIds[id] = resolved[id];
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify({
        paddleIds,
        missing: requested.filter((id) => !paddleIds[id]),
        environment: "live",
      }),
    });
  });
}

/**
 * Stubs Paddle's localized price preview.
 *
 * The stubbed resolver hands the page synthetic `pri_...` ids, so a real call
 * to Paddle would 400 on ids that do not exist — noise from the fixture, not
 * from the app. Localized pricing has its own coverage; here we only care
 * about the catalog-availability behaviour.
 */
async function stubPricePreview(page) {
  await page.route(/paddle\.com\/.*pricing-preview/i, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify({
        data: { currency_code: "USD", details: { line_items: [] } },
        meta: { request_id: "stub" },
      }),
    });
  });
}

async function openPricing(page) {
  await page.goto(`${BASE}/pricing`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
  // Consent gate blocks pointer interaction on a fresh profile.
  const accept = page.getByRole("button", { name: /accept all|accept/i }).first();
  if (await accept.isVisible().catch(() => false)) await accept.click().catch(() => {});
  await page.waitForTimeout(1200);
}

async function run() {
  const browser = await launchBrowser();
  try {
    // ---- case 1: catalog completely empty ---------------------------------
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 1800 } });
    const page = await ctx.newPage();
    const consoleErrors = [];
    page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
    page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));

    await stubResolver(page, {});
    await stubPricePreview(page);
    await openPricing(page);

    const notice = page.getByTestId("payments-catalog-notice");
    const noticeVisible = await notice.isVisible().catch(() => false);
    record("empty catalog: recovery notice is shown", noticeVisible);

    if (noticeVisible) {
      const text = (await notice.innerText()).replace(/\s+/g, " ");
      record(
        "empty catalog: notice explains products aren't set up",
        /aren't available to buy just yet/i.test(text),
        text.slice(0, 90),
      );
      record(
        "empty catalog: notice offers a human fallback",
        /support@gradr\.me/i.test(text),
      );
      record(
        "empty catalog: notice is marked unavailable, not partial",
        (await notice.getAttribute("data-preflight-status")) === "unavailable",
      );
    }

    const subscribeButtons = page.locator('[data-testid^="plan-cta-"]');
    const count = await subscribeButtons.count();
    record("empty catalog: plan CTAs are present", count > 0, `${count} CTAs`);
    let enabled = 0;
    for (let i = 0; i < count; i += 1) {
      if (await subscribeButtons.nth(i).isEnabled()) enabled += 1;
    }
    record("empty catalog: every plan CTA is disabled", enabled === 0, `${enabled} still enabled`);

    // A disabled button must still say why, or it reads as a broken page.
    const firstCta = count > 0 ? await subscribeButtons.first().innerText() : "";
    record(
      "empty catalog: disabled CTA explains itself",
      /not available yet/i.test(firstCta),
      firstCta,
    );

    // The page must not blank out — the USD catalog price still renders.
    const body = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    record("empty catalog: prices still render", /\$\d/.test(body));

    const { failures, ignored } = partitionConsoleMessages(consoleErrors);
    record(
      "empty catalog: no console errors",
      failures.length === 0,
      failures.slice(0, 2).join(" | ") || (ignored.length ? `ignored: ${describeIgnored(ignored)}` : ""),
    );
    await ctx.close();

    // ---- case 2: partial catalog ------------------------------------------
    const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 1800 } });
    const page2 = await ctx2.newPage();
    const consoleErrors2 = [];
    page2.on("console", (m) => m.type() === "error" && consoleErrors2.push(m.text()));
    page2.on("pageerror", (e) => consoleErrors2.push(`pageerror: ${e.message}`));

    // Only the yearly Pro price exists; the page defaults to the yearly tab.
    await stubResolver(page2, { pro_annual: "pri_live_pro_annual" });
    await stubPricePreview(page2);
    await openPricing(page2);

    const notice2 = page2.getByTestId("payments-catalog-notice");
    record(
      "partial catalog: notice is shown as partial",
      (await notice2.getAttribute("data-preflight-status").catch(() => null)) === "partial",
    );

    const proCta = page2.getByTestId("plan-cta-pro");
    record(
      "partial catalog: the available plan stays purchasable",
      await proCta.isEnabled().catch(() => false),
    );
    const starterCta = page2.getByTestId("plan-cta-starter");
    record(
      "partial catalog: the missing plan is disabled",
      !(await starterCta.isEnabled().catch(() => true)),
    );

    const { failures: failures2 } = partitionConsoleMessages(consoleErrors2);
    record("partial catalog: no console errors", failures2.length === 0, failures2.slice(0, 2).join(" | "));
    await ctx2.close();
  } finally {
    await browser.close();
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
  if (failed.length) process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
