/**
 * Shared Chromium resolution for the Playwright-based checks.
 *
 * Playwright's bundled download is preferred; when the pinned revision isn't
 * present (CI images that ship their own browser) we fall back to any Chromium
 * in the shared cache, or to PLAYWRIGHT_CHROMIUM_PATH / CHROME_PATH.
 */
import { chromium } from "playwright";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

export function findChromium() {
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

export async function launchBrowser(options = {}) {
  try {
    return await chromium.launch(options);
  } catch (err) {
    const executablePath = findChromium();
    if (!executablePath) throw err;
    console.log(`(using fallback Chromium at ${executablePath})`);
    return chromium.launch({ ...options, executablePath });
  }
}

/**
 * Phrases that only exist in the crawler fallback shell. If any of them are
 * ever painted for a JS-capable visitor, the SEO block has leaked on screen.
 */
export const SEO_SHELL_PHRASES = [
  "not a grading, marking or test-score tool",
  "What Gradr does",
  "Resume analysis and ATS optimization",
];

/**
 * Samples the page repeatedly while it boots and reports any frame where the
 * SEO fallback text was visible, or where the splash never went away.
 *
 * Returns { seoVisibleFrames, splashStuck, samples }.
 */
export async function sampleForFlash(page, { samples = 30, intervalMs = 60 } = {}) {
  return page.evaluate(
    async ({ samples, intervalMs, phrases }) => {
      const isPainted = (el) => {
        if (!el) return false;
        const rects = el.getClientRects();
        if (!rects.length) return false;
        const style = getComputedStyle(el);
        if (style.visibility === "hidden" || style.display === "none") return false;
        if (Number(style.opacity) === 0) return false;
        const r = rects[0];
        // sr-only style clipping (1px boxes) does not count as painted.
        return r.width > 4 && r.height > 4;
      };

      const seoVisibleFrames = [];
      let splashVisibleAt = -1;

      for (let i = 0; i < samples; i++) {
        const body = document.body;
        const text = body ? body.innerText || "" : "";
        const hit = phrases.find((p) => text.includes(p));
        if (hit) {
          // Confirm the node carrying it is actually painted (not <noscript>).
          const els = Array.from(document.body.querySelectorAll("h1,h2,p,li,main,div"));
          const painted = els.some((el) => (el.textContent || "").includes(hit) && isPainted(el));
          if (painted) seoVisibleFrames.push({ sample: i, phrase: hit });
        }
        const splash = document.getElementById("app-splash");
        if (splash && isPainted(splash) && splash.getAttribute("data-hiding") !== "true") {
          splashVisibleAt = i;
        }
        await new Promise((r) => setTimeout(r, intervalMs));
      }

      return {
        seoVisibleFrames,
        splashStuck: splashVisibleAt >= samples - 2,
        samples,
      };
    },
    { samples, intervalMs, phrases: SEO_SHELL_PHRASES },
  );
}
