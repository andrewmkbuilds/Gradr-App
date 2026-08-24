/**
 * Deterministic waits for screenshot-based checks.
 *
 * Visual diffs go flaky when a capture lands mid-flight: fonts still swapping,
 * images decoding, a spring animation halfway, a caret blinking. `settle()`
 * removes each of those sources of nondeterminism, and `stableScreenshot()`
 * only returns bytes once two consecutive captures are identical.
 */
import { createHash } from "node:crypto";

const FREEZE_CSS = `*,*::before,*::after{
  animation-duration:0s!important;
  animation-delay:0s!important;
  animation-iteration-count:1!important;
  transition-duration:0s!important;
  transition-delay:0s!important;
  scroll-behavior:auto!important;
  caret-color:transparent!important;
}`;

/**
 * Waits until the page is visually quiet: network idle, fonts loaded, images
 * decoded, animations frozen, scroll reset and two animation frames elapsed.
 */
export async function settle(page, { timeout = 15000 } = {}) {
  await page.waitForLoadState("domcontentloaded").catch(() => {});
  await page.waitForLoadState("networkidle", { timeout }).catch(() => {});

  await page.addStyleTag({ content: FREEZE_CSS }).catch(() => {});

  await page
    .evaluate(async () => {
      if (document.fonts?.ready) await document.fonts.ready;
      await Promise.all(
        Array.from(document.images)
          .filter((img) => !img.complete)
          .map(
            (img) =>
              new Promise((resolve) => {
                img.addEventListener("load", resolve, { once: true });
                img.addEventListener("error", resolve, { once: true });
              }),
          ),
      );
      window.scrollTo(0, 0);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    })
    .catch(() => {});
}

const hash = (buf) => createHash("sha1").update(buf).digest("hex");

/**
 * Screenshots repeatedly until two consecutive captures are byte-identical, so
 * the diff compares a settled frame rather than whatever was on screen first.
 * Returns the last capture even if it never stabilised (with `stable: false`).
 */
export async function stableScreenshot(page, options = {}) {
  const { attempts = 6, intervalMs = 200, ...shotOptions } = options;
  let previous = null;
  let previousHash = null;

  for (let i = 0; i < attempts; i += 1) {
    const shot = await page.screenshot(shotOptions);
    const current = hash(shot);
    if (previousHash && current === previousHash) return { buffer: shot, stable: true, frames: i + 1 };
    previous = shot;
    previousHash = current;
    await page.waitForTimeout(intervalMs);
  }
  return { buffer: previous, stable: false, frames: attempts };
}

/**
 * Retries an assertion-producing async task. `task(attempt)` must resolve to
 * `{ ok, ...detail }`; the first ok result wins, otherwise the last is returned.
 * `beforeRetry` gets a chance to re-settle the page between attempts.
 */
export async function withRetry(task, { attempts = 3, beforeRetry } = {}) {
  let last;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    last = await task(attempt);
    if (last?.ok) return { ...last, attempts: attempt };
    if (attempt < attempts && beforeRetry) await beforeRetry(attempt);
  }
  return { ...last, attempts };
}
