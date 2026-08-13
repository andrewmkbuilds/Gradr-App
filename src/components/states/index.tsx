import { AlertTriangle, Inbox, RefreshCw } from "lucide-react";
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

function StateShell({ children, className }: { children: ReactNode; className?: string }) {
  const reduced = useReducedMotionPref();
  return (
    <motion.div
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduced ? 0.15 : duration.base, ease: easeOut }}
      className={cn("flex flex-col items-center justify-center gap-3 px-6 py-12 text-center", className)}
    >
      {children}
    </motion.div>
  );
}

export function EmptyState({
  title,
  description,
  icon: Icon = Inbox,
  action,
  className,
}: {
  title: string;
  description?: string;
  icon?: typeof Inbox;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <StateShell className={className}>
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </div>
      <h3 className="text-h3 text-foreground">{title}</h3>
      {description && <p className="max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action}
    </StateShell>
  );
}

export function ErrorState({
  title = "Something went wrong",
  description = "We couldn't load this right now. Try again in a moment.",
  onRetry,
  className,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <StateShell className={className}>
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
        <AlertTriangle className="h-5 w-5" aria-hidden="true" />
      </div>
      <h3 className="text-h3 text-foreground" role="alert">
        {title}
      </h3>
      <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      {onRetry && (
        <Button variant="outline" onClick={onRetry} className="interactive press-scale mt-1 gap-2">
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Try again
        </Button>
      )}
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
