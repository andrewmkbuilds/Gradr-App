import { describe, expect, it } from "vitest";
import {
  DEFAULT_TURN_TIMING,
  TURN_TIMING_LIMITS,
  endOfTurnDelay,
  normalizeTurnTiming,
  soundsUnfinished,
} from "@/lib/interview/turnTaking";

/**
 * Turn-taking timing decides whether the interviewer interrupts a thinking
 * pause. These tests pin the two behaviours that matter: the window is always
 * within safe bounds, and a mid-sentence pause buys the candidate more time.
 */

describe("turn timing", () => {
  it("clamps configured values into the supported range", () => {
    expect(normalizeTurnTiming({ endOfTurnMs: 50, bargeInMs: 9000 })).toEqual({
      endOfTurnMs: TURN_TIMING_LIMITS.endOfTurnMs.min,
      bargeInMs: TURN_TIMING_LIMITS.bargeInMs.max,
    });
  });

  it("falls back to the defaults for junk input", () => {
    expect(normalizeTurnTiming({ endOfTurnMs: Number.NaN })).toEqual(DEFAULT_TURN_TIMING);
    expect(normalizeTurnTiming(null)).toEqual(DEFAULT_TURN_TIMING);
  });

  it("treats a trailing conjunction or filler as mid-sentence", () => {
    expect(soundsUnfinished("we shipped it in a week and")).toBe(true);
    expect(soundsUnfinished("I owned the migration, um")).toBe(true);
    expect(soundsUnfinished("we cut latency by forty percent")).toBe(false);
    expect(soundsUnfinished("")).toBe(false);
  });

  it("extends the silence window when the answer sounds unfinished", () => {
    const timing = { endOfTurnMs: 1800, bargeInMs: 400 };
    expect(endOfTurnDelay("that was the hardest part", timing)).toBe(1800);
    expect(endOfTurnDelay("that was the hardest part because", timing)).toBeGreaterThan(1800);
  });

  it("never extends beyond the maximum supported window", () => {
    const timing = { endOfTurnMs: TURN_TIMING_LIMITS.endOfTurnMs.max, bargeInMs: 0 };
    expect(endOfTurnDelay("and", timing)).toBe(TURN_TIMING_LIMITS.endOfTurnMs.max);
  });
});
