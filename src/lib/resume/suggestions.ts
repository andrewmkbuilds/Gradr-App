import { z } from "zod";
import type { Json } from "@/integrations/supabase/types";

/**
 * Canonical suggestion types the fix list knows how to render.
 * Anything else from the model is coerced to `improvement`.
 */
export const SUGGESTION_TYPES = ["critical", "warning", "improvement", "good"] as const;
export type SuggestionType = (typeof SUGGESTION_TYPES)[number];

/**
 * A single resume fix-list item.
 *
 * Kept structurally JSON-safe (only string fields) so it round-trips through
 * the `resumes.ai_suggestions` column, which is typed as `Json`.
 */
export interface Suggestion {
  type: SuggestionType;
  /** What is wrong, in plain language. */
  text: string;
  /** The recommended next action the user should take. */
  action?: string;
  /** Where the finding came from (e.g. "ATS parser", "Job description overlap"). */
  source?: string;
}

const nonEmptyString = z.string().trim().min(1);

/** Accepts the loose shapes models and older saved versions produce. */
const rawSuggestionSchema = z
  .object({
    type: z.string().optional(),
    text: z.string().optional(),
    message: z.string().optional(),
    suggestion: z.string().optional(),
    action: z.string().optional(),
    next_action: z.string().optional(),
    recommendation: z.string().optional(),
    source: z.string().optional(),
    origin: z.string().optional(),
    category: z.string().optional(),
  })
  .passthrough();

function normalizeType(value: unknown): SuggestionType {
  const t = typeof value === "string" ? value.trim().toLowerCase() : "";
  return (SUGGESTION_TYPES as readonly string[]).includes(t) ? (t as SuggestionType) : "improvement";
}

function pick(...values: unknown[]): string | undefined {
  for (const v of values) {
    const parsed = nonEmptyString.safeParse(v);
    if (parsed.success) return parsed.data;
  }
  return undefined;
}

/**
 * Runtime validation for a suggestions payload of unknown provenance
 * (AI response, saved `Json` column, hand-edited row).
 *
 * Never throws: malformed entries are dropped rather than breaking rendering.
 */
export function parseSuggestions(input: unknown): Suggestion[] {
  const list = typeof input === "string" ? safeJson(input) : input;
  if (!Array.isArray(list)) return [];

  const out: Suggestion[] = [];
  for (const entry of list) {
    if (typeof entry === "string") {
      const text = pick(entry);
      if (text) out.push({ type: "improvement", text });
      continue;
    }
    const parsed = rawSuggestionSchema.safeParse(entry);
    if (!parsed.success) continue;
    const r = parsed.data;
    const text = pick(r.text, r.message, r.suggestion);
    if (!text) continue;
    const suggestion: Suggestion = { type: normalizeType(r.type), text };
    const action = pick(r.action, r.next_action, r.recommendation);
    if (action) suggestion.action = action;
    const source = pick(r.source, r.origin, r.category);
    if (source) suggestion.source = source;
    out.push(suggestion);
  }
  return out;
}

function safeJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

/** Suggestions as a value that is safe to persist in a `Json` column. */
export function suggestionsToJson(suggestions: Suggestion[]): Json {
  return suggestions.map((s) => ({ ...s })) as unknown as Json;
}
