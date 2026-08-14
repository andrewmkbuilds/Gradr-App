import { describe, it, expect, expectTypeOf } from "vitest";
import type { Json } from "@/integrations/supabase/types";
import {
  parseSuggestions,
  suggestionsToJson,
  type Suggestion,
} from "@/lib/resume/suggestions";

describe("parseSuggestions", () => {
  it("keeps well-formed suggestions with action and source", () => {
    expect(
      parseSuggestions([
        { type: "critical", text: "No quantified results", action: "Add metrics to 3 bullets", source: "Impact scan" },
      ]),
    ).toEqual([
      { type: "critical", text: "No quantified results", action: "Add metrics to 3 bullets", source: "Impact scan" },
    ]);
  });

  it("coerces unknown types to improvement and maps alias fields", () => {
    expect(
      parseSuggestions([{ type: "nonsense", message: "Add skills", recommendation: "List 5 tools", origin: "JD overlap" }]),
    ).toEqual([{ type: "improvement", text: "Add skills", action: "List 5 tools", source: "JD overlap" }]);
  });

  it("drops malformed entries instead of throwing", () => {
    expect(parseSuggestions([null, 42, {}, { text: "   " }, [], { text: "Fine" }])).toEqual([
      { type: "improvement", text: "Fine" },
    ]);
  });

  it("handles non-array and stringified payloads", () => {
    expect(parseSuggestions(undefined)).toEqual([]);
    expect(parseSuggestions("not json")).toEqual([]);
    expect(parseSuggestions('[{"type":"good","text":"Clean formatting"}]')).toEqual([
      { type: "good", text: "Clean formatting" },
    ]);
  });

  it("accepts plain strings", () => {
    expect(parseSuggestions(["Trim to one page"])).toEqual([{ type: "improvement", text: "Trim to one page" }]);
  });
});

describe("Suggestion / Json compatibility", () => {
  it("stays assignable to the Json column type", () => {
    const suggestions: Suggestion[] = [{ type: "warning", text: "Long bullets", action: "Split them", source: "Readability" }];
    const json = suggestionsToJson(suggestions);
    expectTypeOf(json).toMatchTypeOf<Json>();
    // Round-trip through Json must preserve the shape.
    expect(parseSuggestions(JSON.parse(JSON.stringify(json)))).toEqual(suggestions);
  });

  it("only uses JSON-serializable primitives", () => {
    const s: Suggestion = { type: "good", text: "Strong verbs" };
    for (const value of Object.values(s)) expect(typeof value).toBe("string");
  });
});
