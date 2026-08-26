import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AiStreamError, streamEdgeFunction, type StreamStage } from "@/lib/ai/streamFunction";

export type AiStreamStatus = "idle" | "streaming" | "done" | "error" | "canceled";

export interface UseAiStreamOptions<TResult> {
  /** Edge function name, e.g. "generate-application". */
  fn: string;
  /** Called once the final result arrives. */
  onResult?: (result: TResult) => void | Promise<void>;
  /** Called for a usable intermediate result. */
  onPartial?: (partial: TResult) => void;
  /** Label shown before the first stage event lands. */
  initialLabel?: string;
  /**
   * Retry automatically once the server's rate-limit window elapses.
   * Defaults to true — the wait is known exactly, so making the user click
   * "Retry" after a countdown they already watched is busywork.
   */
  autoRetryOnRateLimit?: boolean;
}

export interface AiStreamState<TResult> {
  status: AiStreamStatus;
  /** 0..1 — driven by real server milestones, never a fake timer. */
  progress: number;
  /** Human-readable description of the current milestone. */
  label: string;
  stage: StreamStage | null;
  /** Text streamed so far (empty for structured-only generations). */
  text: string;
  partial: TResult | null;
  result: TResult | null;
  error: string | null;
  isStreaming: boolean;
  /** Set while a 429 window is open: whole seconds left before the auto-retry. */
  rateLimitSecondsRemaining: number | null;
  /** True when this run failed because of throttling rather than an error. */
  rateLimited: boolean;
  start: (body: Record<string, unknown>) => Promise<TResult | null>;
  cancel: () => void;
  retry: () => Promise<TResult | null>;
  reset: () => void;
}

/**
 * Drives one streamed AI generation: live progress, partial output, and a
 * cancel/retry pair. Cancel aborts the request (the server refunds the
 * credit); retry replays the exact same request body.
 */
export function useAiStream<TResult = unknown>({
  fn,
  onResult,
  onPartial,
  initialLabel = "Starting up",
  autoRetryOnRateLimit = true,
}: UseAiStreamOptions<TResult>): AiStreamState<TResult> {
  const [status, setStatus] = useState<AiStreamStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [label, setLabel] = useState(initialLabel);
  const [stage, setStage] = useState<StreamStage | null>(null);
  const [text, setText] = useState("");
  const [partial, setPartial] = useState<TResult | null>(null);
  const [result, setResult] = useState<TResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rateLimitSecondsRemaining, setRateLimitSecondsRemaining] = useState<number | null>(null);
  const [rateLimited, setRateLimited] = useState(false);

  const retryTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const runRef = useRef<((body: Record<string, unknown>) => Promise<TResult | null>) | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const lastBodyRef = useRef<Record<string, unknown> | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      abortRef.current?.abort();
      if (retryTimerRef.current) clearInterval(retryTimerRef.current);
    };
  }, []);

  const clearRateLimit = useCallback(() => {
    if (retryTimerRef.current) clearInterval(retryTimerRef.current);
    retryTimerRef.current = null;
    setRateLimitSecondsRemaining(null);
    setRateLimited(false);
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    clearRateLimit();
    setStatus("idle");
    setProgress(0);
    setLabel(initialLabel);
    setStage(null);
    setText("");
    setPartial(null);
    setResult(null);
    setError(null);
  }, [initialLabel, clearRateLimit]);

  const run = useCallback(
    async (body: Record<string, unknown>): Promise<TResult | null> => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      lastBodyRef.current = body;

      setStatus("streaming");
      setProgress(0.04);
      setLabel(initialLabel);
      setStage(null);
      setText("");
      setPartial(null);
      setResult(null);
      setError(null);
      clearRateLimit();

      try {
        const final = await streamEdgeFunction<TResult>(
          fn,
          body,
          {
            onStage: (next) => {
              if (!mounted.current) return;
              setStage(next);
              setLabel(next.label);
              setProgress((prev) => Math.max(prev, next.progress));
            },
            onDelta: (_chunk, accumulated) => {
              if (mounted.current) setText(accumulated);
            },
            onPartial: (value) => {
              if (!mounted.current) return;
              setPartial(value);
              onPartial?.(value);
            },
          },
          controller.signal,
        );

        if (!mounted.current) return final;
        setResult(final);
        setProgress(1);
        setStatus("done");
        await onResult?.(final);
        return final;
      } catch (e) {
        if (controller.signal.aborted) {
          if (mounted.current) {
            setStatus("canceled");
            setLabel("Generation canceled");
          }
          return null;
        }
        const status = e instanceof AiStreamError ? e.status : 500;
        const message = e instanceof Error && e.message ? e.message : "Generation failed";

        if (status === 401) {
          toast.error("Please sign in to use this feature", {
            description: "Your session may have expired.",
            action: { label: "Sign in", onClick: () => { window.location.href = "/auth"; } },
          });
        } else if (status === 402) {
          toast.error("AI credits exhausted", { description: "Add credits or upgrade to keep generating." });
        } else if (status === 429) {
          toast.error("You're going a bit fast", { description: message });
        }

        if (mounted.current) {
          setError(message);
          setStatus("error");
        }

        // Throttling has a known end time, so count it down and (by default)
        // replay the exact same request the moment the window reopens.
        const retryAfterMs = e instanceof AiStreamError ? e.retryAfterMs : null;
        if (status === 429 && mounted.current) {
          setRateLimited(true);
          const waitMs = retryAfterMs ?? 60_000;
          const deadline = Date.now() + waitMs;
          setRateLimitSecondsRemaining(Math.max(1, Math.ceil(waitMs / 1000)));
          if (retryTimerRef.current) clearInterval(retryTimerRef.current);
          retryTimerRef.current = setInterval(() => {
            if (!mounted.current) return;
            const left = Math.ceil((deadline - Date.now()) / 1000);
            if (left > 0) {
              setRateLimitSecondsRemaining(left);
              return;
            }
            if (retryTimerRef.current) clearInterval(retryTimerRef.current);
            retryTimerRef.current = null;
            setRateLimitSecondsRemaining(null);
            setRateLimited(false);
            if (autoRetryOnRateLimit && lastBodyRef.current) {
              void runRef.current?.(lastBodyRef.current);
            }
          }, 1000);
        }
        return null;
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
      }
    },
    [fn, initialLabel, onPartial, onResult, clearRateLimit, autoRetryOnRateLimit],
  );

  runRef.current = run;

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    clearRateLimit();
  }, [clearRateLimit]);

  const retry = useCallback(async () => {
    if (!lastBodyRef.current) return null;
    return run(lastBodyRef.current);
  }, [run]);

  return {
    status,
    progress,
    label,
    stage,
    text,
    partial,
    result,
    error,
    isStreaming: status === "streaming",
    rateLimitSecondsRemaining,
    rateLimited,
    start: run,
    cancel,
    retry,
    reset,
  };
}
