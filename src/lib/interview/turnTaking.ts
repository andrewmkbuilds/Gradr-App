/**
 * Turn-taking timing.
 *
 * Two numbers decide whether the interview feels like a conversation or like
 * an argument with a kiosk:
 *
 *  - endOfTurnMs — how long the candidate may go quiet before their answer is
 *    treated as finished. Too short and the interviewer talks over a thinking
 *    pause; too long and every answer ends in dead air.
 *  - bargeInMs — the beat between the interviewer finishing and the mic opening,
 *    and the grace period before a candidate's first syllable cuts the
 *    interviewer off. It stops the two voices from clipping each other.
 *
 * Both are candidate-configurable and persisted locally, because natural
 * speaking pace is personal — a measured speaker needs a longer pause than a
 * fast one, and no single default serves both.
 */

export interface TurnTiming {
  /** Silence, in ms, that ends the candidate's turn. */
  endOfTurnMs: number;
  /** Hand-over / barge-in guard, in ms. */
  bargeInMs: number;
}

export const TURN_TIMING_LIMITS = {
  endOfTurnMs: { min: 800, max: 5000, step: 100 },
  bargeInMs: { min: 0, max: 1200, step: 50 },
} as const;

export const DEFAULT_TURN_TIMING: TurnTiming = {
  endOfTurnMs: 1900,
  bargeInMs: 420,
};

const STORAGE_KEY = "gradr.interview.turnTiming";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function normalizeTurnTiming(input: Partial<TurnTiming> | null | undefined): TurnTiming {
  const end = Number(input?.endOfTurnMs);
  const barge = Number(input?.bargeInMs);
  return {
    endOfTurnMs: Number.isFinite(end)
      ? clamp(end, TURN_TIMING_LIMITS.endOfTurnMs.min, TURN_TIMING_LIMITS.endOfTurnMs.max)
      : DEFAULT_TURN_TIMING.endOfTurnMs,
    bargeInMs: Number.isFinite(barge)
      ? clamp(barge, TURN_TIMING_LIMITS.bargeInMs.min, TURN_TIMING_LIMITS.bargeInMs.max)
      : DEFAULT_TURN_TIMING.bargeInMs,
  };
}

export function loadTurnTiming(): TurnTiming {
  if (typeof window === "undefined") return DEFAULT_TURN_TIMING;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? normalizeTurnTiming(JSON.parse(raw)) : DEFAULT_TURN_TIMING;
  } catch {
    return DEFAULT_TURN_TIMING;
  }
}

export function saveTurnTiming(timing: TurnTiming) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeTurnTiming(timing)));
  } catch {
    // Private-mode storage failures must never break a live interview.
  }
}

/**
 * Words that almost always have more sentence behind them. Ending a turn on
 * one of these is the single most common way a mock interviewer interrupts a
 * candidate mid-thought, so the silence window is extended when we hear one.
 */
const CONTINUATION_TOKENS = new Set([
  "and", "but", "so", "because", "which", "that", "then", "or", "if", "while",
  "when", "where", "with", "to", "for", "of", "the", "a", "an", "my", "our",
  "um", "uh", "erm", "like", "basically", "actually",
]);

/** True when the transcript sounds mid-sentence rather than finished. */
export function soundsUnfinished(transcript: string): boolean {
  const trimmed = transcript.trim();
  if (!trimmed) return false;
  if (/[,;:—-]$/.test(trimmed)) return true;
  const last = trimmed.toLowerCase().split(/\s+/).pop() ?? "";
  return CONTINUATION_TOKENS.has(last.replace(/[^a-z]/g, ""));
}

/**
 * The silence window to apply right now. A trailing "and…" or a filler buys
 * the candidate another half-window before the interviewer takes over.
 */
export function endOfTurnDelay(transcript: string, timing: TurnTiming): number {
  const base = timing.endOfTurnMs;
  return soundsUnfinished(transcript)
    ? Math.min(TURN_TIMING_LIMITS.endOfTurnMs.max, Math.round(base * 1.6))
    : base;
}
