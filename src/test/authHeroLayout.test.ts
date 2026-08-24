import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * Responsive layout guardrail for the Auth hero.
 *
 * The headline "Your AI career command center." previously clipped because a
 * container constrained its height or hid overflow. These static checks fail
 * the build if a class that can reintroduce clipping is added back.
 */
const SOURCE = readFileSync(join(process.cwd(), "src/components/AuthLayout.tsx"), "utf8");

/** Class patterns that clip or truncate multi-line text. */
const FORBIDDEN: [RegExp, string][] = [
  [/\btruncate\b/, "truncate clips the headline to one line"],
  [/\bline-clamp-\d/, "line-clamp hides overflowing lines"],
  [/\bwhitespace-nowrap\b/, "nowrap forces one line and overflows narrow viewports"],
  [/\bh-\[\d/, "fixed pixel height cannot fit a wrapped headline"],
  [/\bmax-h-/, "max-height clips wrapped lines"],
  [/\boverflow-hidden\b/, "overflow-hidden clips descenders and wrapped lines"],
  [/\btext-ellipsis\b/, "ellipsis truncation hides headline text"],
];

/** Extract each hero headline element (opening tag + contents). */
function heroBlocks(): { variant: string; tag: string }[] {
  const out: { variant: string; tag: string }[] = [];
  const re = /<p\b([^>]*data-auth-hero="(\w+)"[^>]*)>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(SOURCE))) out.push({ variant: m[2], tag: m[1] });
  return out;
}

describe("Auth hero layout guardrail", () => {
  const blocks = heroBlocks();

  it("renders exactly one hero headline (marketing panel removed)", () => {
    expect(blocks.map((b) => b.variant)).toEqual(["single"]);
  });

  it.each(blocks.map((b) => b.variant))("%s headline has no clipping classes", (variant) => {
    const tag = blocks.find((b) => b.variant === variant)!.tag;
    for (const [pattern, why] of FORBIDDEN) {
      expect(pattern.test(tag), `${variant} headline: ${why}`).toBe(false);
    }
  });

  it.each(blocks.map((b) => b.variant))("%s headline wraps and balances text", (variant) => {
    const tag = blocks.find((b) => b.variant === variant)!.tag;
    expect(tag).toMatch(/break-words/);
    expect(tag).toMatch(/text-balance/);
    // Bottom padding keeps gradient-clipped descenders visible.
    expect(tag).toMatch(/\bpb-\d/);
  });

  it.each(blocks.map((b) => b.variant))("%s headline leading is at least 1.2", (variant) => {
    const tag = blocks.find((b) => b.variant === variant)!.tag;
    const m = tag.match(/leading-\[([\d.]+)\]/);
    if (m) expect(Number(m[1])).toBeGreaterThanOrEqual(1.2);
  });

  it("has no marketing hero panel on the sign-in screen", () => {
    expect(SOURCE).not.toMatch(/lg:w-1\/2/);
    expect(SOURCE).not.toMatch(/marquee/);
  });

  it("never applies a fixed height to the auth shell", () => {
    expect(SOURCE).toMatch(/min-h-screen/);
    expect(SOURCE).not.toMatch(/(?<!min-)\bh-screen\b/);
  });
});
