import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Static half of the SEO-flash regression suite.
 *
 * The browser half (`scripts/seo-flash-regression.mjs`) proves the fallback is
 * never painted during refresh/hard refresh in light and dark. This test
 * enforces the structural rule that makes that true, so a regression is caught
 * in unit CI before anyone boots a browser: the crawler copy must live inside
 * <noscript> only, and it must never be hidden with cloaking CSS instead.
 */

const html = readFileSync(resolve(process.cwd(), "index.html"), "utf8");

const FALLBACK_MARKERS = [
  "not a grading, marking or test-score tool",
  "What Gradr does",
  "Resume analysis and ATS optimization",
];

function noscriptBlocks(source: string): string[] {
  return Array.from(source.matchAll(/<noscript[\s\S]*?<\/noscript>/gi)).map((m) => m[0]);
}

describe("SEO fallback shell", () => {
  const blocks = noscriptBlocks(html);
  const insideNoscript = blocks.join("\n");
  const outsideNoscript = html.replace(/<noscript[\s\S]*?<\/noscript>/gi, "");

  it("ships the crawler copy in a <noscript> block", () => {
    expect(blocks.length).toBeGreaterThan(0);
    for (const marker of FALLBACK_MARKERS) {
      expect(insideNoscript).toContain(marker);
    }
  });

  it("never renders the crawler copy outside <noscript>", () => {
    for (const marker of FALLBACK_MARKERS) {
      expect(outsideNoscript).not.toContain(marker);
    }
  });

  it("has no hidden #seo-shell element (cloaking pattern)", () => {
    expect(outsideNoscript).not.toMatch(/id=["']seo-shell["']/i);
    expect(html).not.toMatch(/#seo-shell\s*\{[^}]*(display\s*:\s*none|visibility\s*:\s*hidden|clip\s*:)/i);
  });

  it("keeps a splash screen that can hide itself", () => {
    expect(html).toMatch(/id=["']app-splash["']/);
    expect(html).toMatch(/#app-splash\[data-hiding="true"\]/);
  });

  it("styles the splash for both light and dark so no theme flashes raw text", () => {
    expect(html).toMatch(/#app-splash\s*\{[\s\S]*?background/);
    expect(html).toMatch(/html\.dark\s+#app-splash\s*\{[^}]*background/);
  });
});
