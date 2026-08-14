import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TimedReveal, estimatedSpeechMs, wordDurationMs } from "@/lib/interview/speechStream";

/**
 * Live captions must never show text the interviewer hasn't spoken yet.
 */
describe("TimedReveal", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("reveals words progressively at a speaking pace", () => {
    const seen: string[] = [];
    const r = new TimedReveal("Hey there I am Alex", (t) => seen.push(t));
    r.startPaced();

    expect(seen[0]).toBe("Hey");
    expect(seen.at(-1)).not.toBe("Hey there I am Alex");

    vi.advanceTimersByTime(estimatedSpeechMs("Hey there I am Alex") + 50);
    expect(seen.at(-1)).toBe("Hey there I am Alex");
    // Monotonic prefixes only — never a jump to the full paragraph.
    seen.forEach((s) => expect("Hey there I am Alex".startsWith(s)).toBe(true));
    expect(seen.length).toBeGreaterThan(3);
  });

  it("finish() completes the caption and stops scheduling", () => {
    const seen: string[] = [];
    const r = new TimedReveal("One two three", (t) => seen.push(t));
    r.startPaced();
    r.finish();
    expect(seen.at(-1)).toBe("One two three");
    const count = seen.length;
    vi.advanceTimersByTime(5_000);
    expect(seen.length).toBe(count);
  });

  it("cancel() stops mid-way without revealing the rest", () => {
    const seen: string[] = [];
    const r = new TimedReveal("Alpha beta gamma delta", (t) => seen.push(t));
    r.startPaced();
    r.cancel();
    vi.advanceTimersByTime(5_000);
    expect(seen.at(-1)).toBe("Alpha");
  });

  it("estimates a plausible speaking duration", () => {
    expect(wordDurationMs("a")).toBeGreaterThanOrEqual(130);
    expect(estimatedSpeechMs("hello world")).toBeGreaterThan(300);
    expect(estimatedSpeechMs("")).toBe(0);
  });
});
