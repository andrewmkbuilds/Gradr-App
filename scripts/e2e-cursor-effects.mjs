#!/usr/bin/env node
/**
 * Cursor atmosphere end-to-end checks.
 *
 * Verifies that the three pointer layers (dot, ring, halo):
 *  1. mount and paint on a capable desktop once the mouse moves,
 *  2. scale up on an interactive target and shrink on mouse-down,
 *  3. never mount on a touch/mobile profile,
 *  4. fully unmount under `prefers-reduced-motion`.
 *
 *   node scripts/e2e-cursor-effects.mjs [baseUrl]
 */
import { launchBrowser } from "./lib/browser.mjs";

const BASE = (process.argv[2] ?? process.env.SMOKE_BASE_URL ?? "http://localhost:8080").replace(/\/$/, "");
const ROUTE = process.env.CURSOR_ROUTE ?? "/auth";

const results = [];
function record(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const layerScale = (page, layer) =>
  page.evaluate((sel) => {
    const el = document.querySelector(`[data-cursor-layer="${sel}"]`);
    if (!el) return null;
    const m = new DOMMatrixReadOnly(getComputedStyle(el).transform);
    // Uniform scale: length of the first basis vector.
    return Math.hypot(m.a, m.b);
  }, layer);

const layerCount = (page) => page.locator("[data-cursor-layer]").count();

async function settle(page, ms = 700) {
  await page.waitForTimeout(ms);
}

async function main() {
  console.log(`Cursor effects e2e against ${BASE}${ROUTE}\n`);
  const browser = await launchBrowser();

  /* ------------------------- 1. desktop, motion on ------------------------- */
  const desktop = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: "no-preference",
  });
  const page = await desktop.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  await page.goto(`${BASE}${ROUTE}`, { waitUntil: "domcontentloaded" });
  await settle(page, 1200);

  const rootMounted = (await page.locator('[data-cursor-effects="true"]').count()) > 0;
  record("cursor root mounts on desktop", rootMounted);

  if (rootMounted) {
    await page.mouse.move(700, 400);
    await page.mouse.move(720, 420);
    await settle(page);

    for (const layer of ["dot", "ring", "halo"]) {
      const present = (await page.locator(`[data-cursor-layer="${layer}"]`).count()) > 0;
      record(`${layer} layer renders after pointer move`, present);
    }

    const idleRing = await layerScale(page, "ring");

    // Hover an interactive target: the ring and halo grow.
    const target = page
      .locator('button:visible, a:visible, [data-cursor="interactive"]:visible')
      .first();
    const box = (await target.count()) ? await target.boundingBox() : null;
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await settle(page, 900);
      const hotRing = await layerScale(page, "ring");
      record(
        "ring scales up over an interactive target",
        hotRing !== null && idleRing !== null && hotRing > idleRing + 0.15,
        `${idleRing?.toFixed(2)} → ${hotRing?.toFixed(2)}`,
      );

      await page.mouse.down();
      await settle(page, 700);
      const pressedRing = await layerScale(page, "ring");
      await page.mouse.up();
      record(
        "ring shrinks on mouse down",
        pressedRing !== null && hotRing !== null && pressedRing < hotRing - 0.15,
        `${hotRing?.toFixed(2)} → ${pressedRing?.toFixed(2)}`,
      );
    } else {
      record("ring scales up over an interactive target", false, "no interactive target found");
      record("ring shrinks on mouse down", false, "no interactive target found");
    }
  } else {
    for (const n of [
      "dot layer renders after pointer move",
      "ring layer renders after pointer move",
      "halo layer renders after pointer move",
      "ring scales up over an interactive target",
      "ring shrinks on mouse down",
    ]) {
      record(n, false, "cursor root never mounted");
    }
  }

  record("no page errors on desktop", errors.length === 0, errors[0] ?? "");
  await desktop.close();

  /* ------------------------------ 2. mobile ------------------------------- */
  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    reducedMotion: "no-preference",
  });
  const mPage = await mobile.newPage();
  await mPage.goto(`${BASE}${ROUTE}`, { waitUntil: "domcontentloaded" });
  await settle(mPage, 1200);
  await mPage.mouse.move(200, 400);
  await settle(mPage);
  const mobileVisible = await mPage.evaluate(() =>
    Array.from(document.querySelectorAll("[data-cursor-layer]")).some((el) => el.getClientRects().length > 0),
  );
  record("cursor layers never paint on mobile", !mobileVisible);
  await mobile.close();

  /* --------------------------- 3. reduced motion --------------------------- */
  const reduced = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: "reduce",
  });
  const rPage = await reduced.newPage();
  await rPage.goto(`${BASE}${ROUTE}`, { waitUntil: "domcontentloaded" });
  await settle(rPage, 1200);
  await rPage.mouse.move(700, 400);
  await rPage.mouse.move(760, 460);
  await settle(rPage);
  record("cursor root unmounts under prefers-reduced-motion", (await rPage.locator('[data-cursor-effects="true"]').count()) === 0);
  record("no cursor layers under prefers-reduced-motion", (await layerCount(rPage)) === 0);
  record(
    "depth capability resolves to off under reduced motion",
    (await rPage.evaluate(() => document.documentElement.dataset.depth)) === "off",
  );
  await reduced.close();

  await browser.close();

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
