import { motion } from "motion/react";
import type { ReactNode } from "react";
import { useReducedMotionPref } from "@/hooks/useMotionPreference";
import { duration, easeOut, springSmooth } from "@/lib/motion/tokens";
import { typography } from "@/lib/design/typography";
import { cn } from "@/lib/utils";

export interface PageHeaderProps {
  /** Small uppercase label above the title — names the module. */
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  /** Buttons or links pinned to the right on desktop. */
  actions?: ReactNode;
  /** Chips, guide links or badges rendered under the description. */
  meta?: ReactNode;
  icon?: ReactNode;
  className?: string;
}

/**
 * The masthead every app surface opens with. A quiet Ocean Teal wash, a
 * display-type title that resolves on mount, and a hairline that draws itself
 * across the page — one gesture that makes each module feel like a place.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  meta,
  icon,
  className,
}: PageHeaderProps) {
  const reduced = useReducedMotionPref();

  return (
    <header className={cn("relative isolate overflow-hidden pb-6", className)}>
      {/* Ambient wash — decorative only. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-24 -top-32 h-64 w-[38rem] rounded-full opacity-[0.16] blur-3xl"
        style={{ background: "radial-gradient(circle, hsl(var(--primary)) 0%, transparent 68%)" }}
      />

      <motion.div
        initial={reduced ? { opacity: 0 } : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={reduced ? { duration: 0.14 } : { duration: duration.base, ease: easeOut }}
        className="flex flex-wrap items-start justify-between gap-4"
      >
        <div className="min-w-0 space-y-2">
          {eyebrow && (
            <p className={cn(typography.overline, "flex items-center gap-2 tracking-[0.2em] text-mahogany")}>
              {icon}
              {eyebrow}
            </p>
          )}
          <h1 className={cn(typography.pageTitle, "text-foreground")}>
            {title}
          </h1>
          {description && (
            <p className={cn(typography.bodyMuted, "max-w-2xl")}>{description}</p>
          )}
          {meta && <div className="flex flex-wrap items-center gap-3 pt-1">{meta}</div>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </motion.div>

      <motion.div
        aria-hidden="true"
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={reduced ? { duration: 0 } : { ...springSmooth, delay: 0.1 }}
        style={{ transformOrigin: "left" }}
        className="accent-rule mt-6 w-full"
      />
    </header>
  );
}

export default PageHeader;
