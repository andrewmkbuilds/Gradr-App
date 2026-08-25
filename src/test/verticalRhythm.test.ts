import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * The vertical rhythm is a single fluid unit with fixed multiples. These tests
 * lock that shape in: if someone reintroduces a bespoke clamp() for a section
 * gap, or restates .page-shell a second time, the scale silently drifts apart
 * at some breakpoint and the site grows unexplained empty bands again.
 */
const css = readFileSync(path.resolve(__dirname, "../index.css"), "utf8");

const RHYTHM_TOKENS = [
  "--rhythm-xs",
  "--rhythm-sm",
  "--rhythm-md",
  "--rhythm-lg",
  "--rhythm-xl",
  "--rhythm-2xl",
  "--rhythm-3xl",
];

describe("vertical rhythm scale", () => {
  it("defines one fluid unit for the whole scale", () => {
    expect(css).toMatch(/--rhythm-unit:\s*clamp\([^)]+\);/);
  });

  it("derives every step from that unit", () => {
    for (const token of RHYTHM_TOKENS) {
      const match = css.match(new RegExp(`${token}:\\s*([^;]+);`));
      expect(match, `${token} is not defined`).toBeTruthy();
      expect(match![1]).toContain("var(--rhythm-unit)");
    }
  });

  it("keeps the steps strictly increasing", () => {
    const multiple = (token: string) => {
      const value = css.match(new RegExp(`${token}:\\s*([^;]+);`))![1];
      if (value.trim() === "var(--rhythm-unit)") return 1;
      return Number(value.match(/\*\s*([\d.]+)/)![1]);
    };
    const values = RHYTHM_TOKENS.map(multiple);
    for (let i = 1; i < values.length; i++) {
      expect(values[i], `${RHYTHM_TOKENS[i]} must exceed ${RHYTHM_TOKENS[i - 1]}`).toBeGreaterThan(
        values[i - 1],
      );
    }
  });

  it("expresses the section utilities as rhythm tokens, not bespoke clamps", () => {
    for (const utility of [".section-hero", ".section-block", ".section-gap", ".page-stack > * + *", ".pad-panel"]) {
      const block = css.slice(css.indexOf(`${utility} {`));
      const body = block.slice(0, block.indexOf("}"));
      expect(body, `${utility} should use the rhythm tokens`).toContain("var(--rhythm-");
      expect(body, `${utility} should not hand-roll a clamp()`).not.toContain("clamp(");
    }
  });

  it("declares .page-shell exactly once", () => {
    const declarations = css.match(/^\s*\.page-shell\s*\{/gm) ?? [];
    expect(declarations).toHaveLength(1);
  });
});
