import { AlertTriangle, Compass, Inbox, RefreshCw, ShieldCheck } from "lucide-react";
import { motion } from "motion/react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Surface } from "@/components/ui/surface";
import { useReducedMotionPref } from "@/hooks/useMotionPreference";
import { duration, easeOut } from "@/lib/motion/tokens";
import { cn } from "@/lib/utils";

/* ------------------------------ skeletons ------------------------------- */

/**
 * Motion-aware skeleton block. Shimmers with full motion, stays a calm solid
 * tint when motion is reduced.
 */
export function SkeletonBlock({ className }: { className?: string }) {
  const reduced = useReducedMotionPref();
  return (
    <div
      aria-hidden="true"
      className={cn(
        "rounded-md bg-surface-secondary",
        !reduced && "skeleton-sheen relative overflow-hidden",
        className,
      )}
    />
  );
}

export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn("space-y-2", className)}>
      {Array.from({ length: lines }).map((_, index) => (
        <SkeletonBlock key={index} className={cn("h-3", index === lines - 1 ? "w-2/3" : "w-full")} />
      ))}
    </div>
  );
}

/** Card-shaped placeholder used while a panel's data loads. */
export function SkeletonPanel({ className, lines = 4 }: { className?: string; lines?: number }) {
  return (
    <Surface level={2} className={cn("space-y-4 p-6", className)} role="status" aria-busy="true">
      <span className="sr-only">Loading…</span>
      <div className="flex items-center gap-3">
        <SkeletonBlock className="h-10 w-10 rounded-lg" />
        <div className="flex-1 space-y-2">
          <SkeletonBlock className="h-3.5 w-1/3" />
          <SkeletonBlock className="h-3 w-1/4" />
        </div>
      </div>
      <SkeletonText lines={lines} />
    </Surface>
  );
}

export function SkeletonList({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("space-y-3", className)}>
      {Array.from({ length: rows }).map((_, index) => (
        <SkeletonPanel key={index} lines={2} />
      ))}
    </div>
  );
}

/* ---------------------------- state surfaces ---------------------------- */

/**
 * Abstract maritime motif: concentric bearing rings behind the state icon.
 * Purely decorative, drawn from tokens so it themes with everything else.
 */
function BearingRings({ tone = "primary" }: { tone?: "primary" | "destructive" }) {
  const color = tone === "destructive" ? "hsl(var(--destructive))" : "hsl(var(--primary))";
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 120 120"
      className="pointer-events-none absolute left-1/2 top-0 h-[120px] w-[120px] -translate-x-1/2 opacity-[0.18]"
    >
      <circle cx="60" cy="60" r="58" fill="none" stroke={color} strokeWidth="0.75" />
      <circle cx="60" cy="60" r="42" fill="none" stroke={color} strokeWidth="0.75" strokeDasharray="3 5" />
      <circle cx="60" cy="60" r="26" fill="none" stroke={color} strokeWidth="0.75" />
      <path d="M60 2v116M2 60h116" stroke={color} strokeWidth="0.5" strokeDasharray="2 6" />
    </svg>
  );
}

function StateShell({ children, className }: { children: ReactNode; className?: string }) {
  const reduced = useReducedMotionPref();
  return (
    <motion.div
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduced ? 0.15 : duration.base, ease: easeOut }}
      className={cn("relative flex flex-col items-center justify-center gap-3 px-6 py-14 text-center", className)}
    >
      {children}
    </motion.div>
  );
}

export interface EmptyStateProps {
  /** What is empty. */
  title: string;
  /** Why it matters — one calm sentence. */
  description?: string;
  /** What the user can do next, rendered as a hint under the action. */
  hint?: string;
  icon?: typeof Inbox;
  action?: ReactNode;
  className?: string;
}

/**
 * The house empty state: names what's missing, says why it matters, and
 * offers the next move. Never a bare "No data".
 */
export function EmptyState({
  title,
  description,
  hint,
  icon: Icon = Inbox,
  action,
  className,
}: EmptyStateProps) {
  return (
    <StateShell className={className}>
      <BearingRings />
      <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Icon className="h-6 w-6" aria-hidden="true" />
      </div>
      <h3 className="font-display text-lg tracking-tight text-foreground">{title}</h3>
      {description && <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">{description}</p>}
      {action && <div className="mt-2 flex flex-wrap items-center justify-center gap-2">{action}</div>}
      {hint && <p className="max-w-xs text-xs text-muted-foreground/80">{hint}</p>}
    </StateShell>
  );
}

/** Empty state for surfaces that need the user to chart a course first. */
export function GetStartedState(props: Omit<EmptyStateProps, "icon">) {
  return <EmptyState {...props} icon={Compass} />;
}

export function ErrorState({
  title = "We couldn't load this",
  description = "The request didn't come back. This is on our side, not yours.",
  /** Reassurance about the user's data — shown unless explicitly disabled. */
  reassurance = "Nothing was lost — your saved work is untouched.",
  onRetry,
  action,
  className,
}: {
  title?: string;
  description?: string;
  reassurance?: string | false;
  onRetry?: () => void;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <StateShell className={className}>
      <BearingRings tone="destructive" />
      <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
        <AlertTriangle className="h-6 w-6" aria-hidden="true" />
      </div>
      <h3 className="font-display text-lg tracking-tight text-foreground" role="alert">
        {title}
      </h3>
      <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">{description}</p>
      {reassurance && (
        <p className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-3 py-1 text-xs text-success">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
          {reassurance}
        </p>
      )}
      <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
        {onRetry && (
          <Button variant="outline" onClick={onRetry} className="gap-2">
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Try again
          </Button>
        )}
        {action}
      </div>
    </StateShell>
  );
}

/** Small inline spinner that respects the motion preference. */
export function LoadingDots({ label = "Loading" }: { label?: string }) {
  const reduced = useReducedMotionPref();
  return (
    <span className="inline-flex items-center gap-1.5" role="status" aria-label={label}>
      {[0, 1, 2].map((index) => (
        <motion.span
          key={index}
          className="h-1.5 w-1.5 rounded-full bg-primary"
          animate={reduced ? { opacity: 0.6 } : { opacity: [0.25, 1, 0.25] }}
          transition={reduced ? undefined : { duration: 1.1, repeat: Infinity, delay: index * 0.15 }}
        />
      ))}
    </span>
  );
}
