/**
 * Reduced motion must make imperative scrolling instant.
 *
 * `src/lib/motion/scroll.ts` is the only sanctioned way to scroll in Gradr, so
 * this suite pins its behaviour and greps the codebase for raw
 * `behavior: "smooth"` escapes that would bypass the preference.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { prefersReducedMotion, scrollBehavior, scrollIntoViewSafely, scrollToSafely } from "@/lib/motion/scroll";

function setMotion(value: "full" | "reduced" | null) {
  if (value === null) delete document.documentElement.dataset.motion;
  else document.documentElement.dataset.motion = value;
}

/** jsdom has no matchMedia by default. */
function mockMatchMedia(reduced: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: reduced && query.includes("prefers-reduced-motion"),
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    onchange: null,
    dispatchEvent: vi.fn(),
  }));
}

beforeEach(() => {
  setMotion(null);
  mockMatchMedia(false);
});

describe("scroll behaviour resolution", () => {
  it("is smooth when motion is allowed", () => {
    setMotion("full");
    expect(prefersReducedMotion()).toBe(false);
    expect(scrollBehavior()).toBe("smooth");
  });

  it("is instant when the in-app toggle is set to reduced", () => {
    setMotion("reduced");
    expect(prefersReducedMotion()).toBe(true);
    expect(scrollBehavior()).toBe("auto");
  });

  it("falls back to the OS prefers-reduced-motion setting", () => {
    setMotion(null);
    mockMatchMedia(true);
    expect(prefersReducedMotion()).toBe(true);
    expect(scrollBehavior()).toBe("auto");
  });

  it("the in-app 'full' choice overrides the OS setting", () => {
    setMotion("full");
    mockMatchMedia(true);
    expect(scrollBehavior()).toBe("smooth");
  });
});

describe("scroll helpers", () => {
  it("scrollIntoViewSafely passes the resolved behaviour", () => {
    const el = document.createElement("div");
    el.id = "target";
    document.body.appendChild(el);
    const spy = vi.fn();
    el.scrollIntoView = spy;

    setMotion("reduced");
    scrollIntoViewSafely("target");
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ behavior: "auto" }));

    setMotion("full");
    scrollIntoViewSafely(el, { block: "center" });
    expect(spy).toHaveBeenLastCalledWith({ block: "center", behavior: "smooth" });

    el.remove();
  });

  it("scrollIntoViewSafely is a no-op for a missing element", () => {
    expect(() => scrollIntoViewSafely("does-not-exist")).not.toThrow();
  });

  it("scrollToSafely passes the resolved behaviour", () => {
    const container = { scrollTo: vi.fn() } as unknown as Element;
    setMotion("reduced");
    scrollToSafely({ top: 0 }, container);
    expect(container.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "auto" });
  });
});

const SRC = join(process.cwd(), "src");
const ALLOWED = ["src/lib/motion/scroll.ts"];

function walk(dir: string, out: string[] = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

describe("no unguarded smooth scrolling", () => {
  it("never hardcodes behavior: 'smooth' outside the motion helper", () => {
    const offenders = walk(SRC)
      .filter((file) => !file.includes("/test/"))
      .filter((file) => !ALLOWED.some((a) => file.endsWith(a)))
      .filter((file) => /behavior:\s*["']smooth["']/.test(readFileSync(file, "utf8")))
      .map((file) => file.replace(process.cwd() + "/", ""));
    expect(offenders, `use scrollIntoViewSafely/scrollToSafely instead:\n${offenders.join("\n")}`).toEqual([]);
  });
});
