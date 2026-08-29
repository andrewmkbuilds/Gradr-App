import { describe, expect, it, vi } from "vitest";
import { SpeechQueue, type AudioResult } from "@/lib/interview/speechStream";

/**
 * The interviewer must never go silent because the studio voice provider had a
 * bad minute. These tests pin the contract: a backend failure is spoken by the
 * browser instead, exactly once is it announced, and barge-in cuts it dead.
 */

function harness(
  fetchAudio: (text: string, signal: AbortSignal) => Promise<AudioResult>,
  speakFallback?: (text: string) => { done: Promise<void>; cancel: () => void },
) {
  const spoken: string[] = [];
  const fallbacks: string[] = [];
  const failures: string[] = [];
  let drained = false;

  const queue = new SpeechQueue({
    fetchAudio,
    beatMs: 0,
    speakFallback,
    onChunkStart: () => {},
    onChunkReveal: () => {},
    onChunkSpoken: (t) => spoken.push(t),
    onSpeakingChange: () => {},
    onDrained: () => {
      drained = true;
    },
    onFailure: (code) => failures.push(code),
    onFallbackEngaged: (code) => fallbacks.push(code),
  });

  return { queue, spoken, fallbacks, failures, isDrained: () => drained };
}

const settle = () => new Promise((r) => setTimeout(r, 40));

describe("SpeechQueue browser fallback", () => {
  it("speaks the thought through the browser when the backend fails", async () => {
    const heard: string[] = [];
    const h = harness(
      async () => ({ error: "VOICE_CONNECTION_FAILED" }),
      (text) => {
        heard.push(text);
        return { done: Promise.resolve(), cancel: () => {} };
      },
    );

    h.queue.push("Tell me about a project you led.");
    h.queue.end();
    await settle();

    expect(heard).toEqual(["Tell me about a project you led."]);
    expect(h.spoken).toEqual(["Tell me about a project you led."]);
    expect(h.failures).toEqual([]);
    expect(h.isDrained()).toBe(true);
  });

  it("announces the fallback once per turn, not once per thought", async () => {
    const h = harness(
      async () => ({ error: "VOICE_UNAVAILABLE" }),
      () => ({ done: Promise.resolve(), cancel: () => {} }),
    );

    h.queue.push("First thought.");
    h.queue.push("Second thought.");
    h.queue.push("Third thought.");
    h.queue.end();
    await settle();

    expect(h.spoken).toHaveLength(3);
    expect(h.fallbacks).toEqual(["VOICE_UNAVAILABLE"]);
  });

  it("surfaces the original error when the browser has no usable voice", async () => {
    const h = harness(
      async () => ({ error: "VOICE_TIMEOUT" }),
      () => ({ done: Promise.reject(new Error("VOICE_UNAVAILABLE")), cancel: () => {} }),
    );

    h.queue.push("Anything at all.");
    h.queue.end();
    await settle();

    expect(h.spoken).toEqual([]);
    expect(h.failures).toEqual(["VOICE_TIMEOUT"]);
  });

  it("ends the turn with the backend error when no fallback is wired", async () => {
    const h = harness(async () => ({ error: "VOICE_CONNECTION_FAILED" }));

    h.queue.push("No fallback available.");
    h.queue.end();
    await settle();

    expect(h.failures).toEqual(["VOICE_CONNECTION_FAILED"]);
  });

  it("cancels in-flight browser speech on barge-in", async () => {
    const cancel = vi.fn();
    let release: () => void = () => {};
    const h = harness(
      async () => ({ error: "VOICE_CONNECTION_FAILED" }),
      () => ({ done: new Promise<void>((r) => { release = r; }), cancel }),
    );

    h.queue.push("The candidate is about to interrupt this sentence.");
    await settle();
    h.queue.stop();
    release();
    await settle();

    expect(cancel).toHaveBeenCalled();
    // A barge-in is not a failure the user should be told to retry.
    expect(h.failures).toEqual([]);
  });
});
