import { AlertTriangle, Clock, RefreshCw, Sparkles, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import { Button } from "@/components/ds/Button";
import { Surface } from "@/components/ui/surface";
import { useReducedMotionPref } from "@/hooks/useMotionPreference";
import { duration as motionDuration, easeOut } from "@/lib/motion/tokens";
import { cn } from "@/lib/utils";
import type { AiStreamStatus } from "@/hooks/useAiStream";

/**
 * Thin, honest progress rail. The value comes from real server milestones —
 * it never creeps forward on a timer.
 */
export function GenerationProgressBar({ value, className }: { value: number; className?: string }) {
  const reduced = useReducedMotionPref();
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-surface-secondary", className)}
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <motion.div
        className="h-full rounded-full bg-gradient-to-r from-primary to-mahogany"
        initial={false}
        animate={{ width: `${pct}%` }}
        transition={reduced ? { duration: 0 } : { duration: motionDuration.base, ease: easeOut }}
      />
    </div>
  );
}

export interface GenerationStreamProps {
  status: AiStreamStatus;
  progress: number;
  label: string;
  /** Streamed text rendered live as it arrives. */
  text?: string;
  error?: string | null;
  /** Title of the surface, e.g. "Cover letter". */
  title: string;
  /** Extra copy under the title while idle-ish states show. */
  description?: string;
  onCancel?: () => void;
  onRetry?: () => void;
  /** Whole seconds left on a rate-limit window; drives the auto-retry copy. */
  rateLimitSecondsRemaining?: number | null;
  /** Rendered instead of the streamed text once the result is final. */
  children?: ReactNode;
  className?: string;
}

/**
 * One consistent surface for every streamed generation: milestone label,
 * real progress, live partial output, and a cancel/retry pair.
 */
export function GenerationStream({
  status,
  progress,
  label,
  text,
  error,
  title,
  description,
  onCancel,
  onRetry,
  rateLimitSecondsRemaining = null,
  children,
  className,
}: GenerationStreamProps) {
  const reduced = useReducedMotionPref();
  const streaming = status === "streaming";
  const pct = Math.round(Math.max(0, Math.min(1, progress)) * 100);
  const waiting = status === "error" && typeof rateLimitSecondsRemaining === "number" && rateLimitSecondsRemaining > 0;

  if (status === "idle") return null;

  return (
    <Surface level={2} className={cn("space-y-4 p-4 sm:p-6", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="type-h3 flex items-center gap-2 text-foreground">
            <Sparkles
              className={cn("h-4 w-4 shrink-0 text-primary", streaming && !reduced && "animate-pulse")}
              aria-hidden="true"
            />
            {title}
          </h2>
          <p className="mt-1 type-body-sm text-muted-foreground" role="status" aria-live="polite">
            {waiting
              ? `Too many analyses just now — retrying automatically in ${rateLimitSecondsRemaining}s.`
              : status === "error"
              ? error || "Generation failed"
              : status === "canceled"
                ? "Canceled — nothing was saved and your credit was returned."
                : status === "done"
                  ? description || "Ready"
                  : `${label}…`}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {streaming && onCancel && (
            <Button variant="ghost" size="sm" onClick={onCancel} className="gap-1.5 min-h-11 sm:min-h-9">
              <X className="h-4 w-4" aria-hidden="true" />
              Cancel
            </Button>
          )}
          {!streaming && (status === "error" || status === "canceled") && onRetry && (
            <Button variant="outline" size="sm" onClick={onRetry} className="gap-1.5 min-h-11 sm:min-h-9">
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Retry
            </Button>
          )}
        </div>
      </div>

      {streaming && (
        <div className="space-y-1.5">
          <GenerationProgressBar value={progress} />
          <p className="type-caption tabular-nums text-muted-foreground">{pct}%</p>
        </div>
      )}

      {status === "error" && (
        waiting ? (
          <p
            className="flex items-start gap-2 rounded-xl bg-surface-secondary p-3 type-body-sm text-muted-foreground"
            data-testid="rate-limit-notice"
            role="status"
            aria-live="polite"
          >
            <Clock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              You've hit the short-term analysis limit. Nothing was lost — the same request runs again
              in <span className="tabular-nums font-medium text-foreground">{rateLimitSecondsRemaining}s</span>,
              or retry now if you prefer.
            </span>
          </p>
        ) : (
          <p className="flex items-start gap-2 rounded-xl bg-destructive/10 p-3 type-body-sm text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Your work is untouched. Retrying re-runs the same request.</span>
          </p>
        )
      )}

      <AnimatePresence initial={false} mode="wait">
        {children ? (
          <motion.div
            key="result"
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={reduced ? { duration: 0.12 } : { duration: motionDuration.base, ease: easeOut }}
          >
            {children}
          </motion.div>
        ) : text ? (
          <motion.div
            key="stream"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="measure-wide max-h-[22rem] overflow-y-auto whitespace-pre-wrap rounded-xl bg-surface-secondary p-4 type-body text-foreground/90"
            aria-live="polite"
          >
            {text}
            {streaming && (
              <motion.span
                aria-hidden="true"
                className="ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 bg-primary"
                animate={reduced ? { opacity: 1 } : { opacity: [1, 0.15, 1] }}
                transition={{ duration: 1, repeat: Infinity }}
              />
            )}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </Surface>
  );
}
