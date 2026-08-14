import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

/**
 * Reduced-motion consistency guard.
 *
 * Gradr resolves motion from ONE place: MotionPreferenceProvider, which layers
 * the in-app toggle over the OS `prefers-reduced-motion` setting and feeds
 * Motion's `MotionConfig`. Components must never re-derive that themselves —
 * a raw `useReducedMotion()` ignores the in-app toggle, and a second motion
 * library escapes MotionConfig entirely.
 */

const SRC = join(process.cwd(), "src");
const MOTION_HOOK = join(SRC, "hooks/useMotionPreference.tsx");

function walk(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, files);
    else if (/\.(ts|tsx)$/.test(full)) files.push(full);
  }
  return files;
}

const files = walk(SRC).filter((f) => !f.includes("/test/"));

describe("reduced motion", () => {
  it("resolves the preference through MotionConfig in one provider", () => {
    const source = readFileSync(MOTION_HOOK, "utf8");
    expect(source).toContain("MotionConfig");
    expect(source).toContain('reducedMotion={reduced ? "always" : "never"}');
    expect(source).toContain("prefers-reduced-motion: reduce");
  });

  it("never imports Motion's raw useReducedMotion", () => {
    const offenders = files.filter((file) => {
      const src = readFileSync(file, "utf8");
      return /import\s*{[^}]*\buseReducedMotion\b[^}]*}\s*from\s*["'](motion\/react|framer-motion)["']/.test(src);
    });
    expect(offenders, "use useReducedMotionPref() instead").toEqual([]);
  });

  it("uses a single motion library (motion/react)", () => {
    const offenders = files.filter((file) =>
      /from\s*["']framer-motion["']/.test(readFileSync(file, "utf8")),
    );
    expect(offenders, "import from 'motion/react'").toEqual([]);
  });

  it("mirrors the resolved preference onto <html data-motion>", () => {
    const css = readFileSync(join(SRC, "index.css"), "utf8");
    expect(css).toContain('html[data-motion="reduced"]');
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    // Blanket safety net for anything the named rules miss.
    expect(css).toMatch(/animation-iteration-count:\s*1\s*!important/);
  });
});
