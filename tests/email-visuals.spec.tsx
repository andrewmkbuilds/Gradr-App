import * as React from "react";
import { render } from "@react-email/render";
import { test, expect } from "../playwright-fixture";
import { AUTH_TEMPLATES } from "../src/lib/email-templates/authSamples";
import { extractImageUrls } from "../src/lib/email/imageAudit";

/**
 * Pixel-level regression cover for every authentication email.
 *
 * Auth emails are the only Gradr surface a user sees *before* they can use the
 * product, and they are never exercised by normal app tests: a template can
 * break its layout, lose the logo, or ship an unreachable image and nothing
 * fails until real users see a broken inbox. So each template is rendered to
 * HTML, loaded in a real browser at desktop and mobile widths, and compared to
 * a committed screenshot.
 *
 * Two independent failure modes are covered:
 *   1. Layout divergence — `toHaveScreenshot` fails when rendering shifts.
 *   2. Broken imagery — every <img> must actually decode in the browser
 *      (naturalWidth > 0), which catches dead CDN links and wrong MIME types
 *      that a pure HTML diff would happily accept.
 *
 * Baselines live in tests/email-visuals.spec.tsx-snapshots/. Update them
 * deliberately with `--update-snapshots` when a template change is intended.
 */

const VIEWPORTS = [
  { name: "desktop", width: 900, height: 1400 },
  { name: "mobile", width: 390, height: 1400 },
] as const;

/** Emails are static documents — freeze anything that could vary per run. */
const DETERMINISM_CSS = `
  <style>
    *, *::before, *::after { animation: none !important; transition: none !important; }
    html { -webkit-font-smoothing: antialiased; }
    body { margin: 0; }
  </style>
`;

for (const entry of AUTH_TEMPLATES) {
  test.describe(`auth email: ${entry.key}`, () => {
    for (const viewport of VIEWPORTS) {
      test(`renders consistently on ${viewport.name}`, async ({ page }) => {
        const html = await render(React.createElement(entry.component, entry.props));

        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.setContent(html + DETERMINISM_CSS, { waitUntil: "load" });

        // Every referenced image must decode, not merely be present in markup.
        const referenced = extractImageUrls(html);
        if (referenced.length > 0) {
          await page.waitForFunction(
            () => Array.from(document.images).every((img) => img.complete),
            undefined,
            { timeout: 15_000 },
          );

          const broken = await page.evaluate(() =>
            Array.from(document.images)
              .filter((img) => img.naturalWidth === 0)
              .map((img) => img.currentSrc || img.src),
          );
          expect(
            broken,
            `Images failed to load in "${entry.key}" — recipients would see empty boxes`,
          ).toEqual([]);
        }

        await expect(page).toHaveScreenshot(`${entry.key}-${viewport.name}.png`, {
          fullPage: true,
          maxDiffPixelRatio: 0.01,
          animations: "disabled",
        });
      });
    }
  });
}
