import { describe, expect, it } from "vitest";
// @ts-expect-error - plain JS check script shared with CI
import { runLegalLinkCheck, CANONICAL_ORIGIN } from "../../scripts/check-legal-links.mjs";

describe("legal links", () => {
  const { problems, missingFromRegistry, missingRoutes } = runLegalLinkCheck();

  it(`points every absolute legal link at ${CANONICAL_ORIGIN}`, () => {
    expect(
      problems.map((p: { file: string; line: number; snippet: string; reason: string }) =>
        `${p.file}:${p.line} ${p.snippet} — ${p.reason}`,
      ),
    ).toEqual([]);
  });

  it("lists every policy page in the shared footer registry", () => {
    expect(missingFromRegistry).toEqual([]);
  });

  it("wires a route for every policy page", () => {
    expect(missingRoutes).toEqual([]);
  });
});
