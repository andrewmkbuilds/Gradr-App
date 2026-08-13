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
}: UseAiStreamOptions<TResult>): AiStreamState<TResult> {
  const [status, setStatus] = useState<AiStreamStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [label, setLabel] = useState(initialLabel);
  const [stage, setStage] = useState<StreamStage | null>(null);
  const [text, setText] = useState("");
  const [partial, setPartial] = useState<TResult | null>(null);
  const [result, setResult] = useState<TResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const lastBodyRef = useRef<Record<string, unknown> | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      abortRef.current?.abort();
    };
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStatus("idle");
    setProgress(0);
    setLabel(initialLabel);
    setStage(null);
    setText("");
    setPartial(null);
    setResult(null);
    setError(null);
  }, [initialLabel]);

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
        return null;
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
      }
    },
    [fn, initialLabel, onPartial, onResult],
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

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
    start: run,
    cancel,
    retry,
    reset,
  };
}
