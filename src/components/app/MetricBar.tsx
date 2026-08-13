import { motion } from "motion/react";
import { CountUp } from "@/components/motion";
import { useReducedMotionPref } from "@/hooks/useMotionPreference";
import { springSoft } from "@/lib/motion/tokens";
import { cn } from "@/lib/utils";

type Tone = "auto" | "primary" | "secondary";

function toneClass(value: number, tone: Tone) {
  if (tone === "primary") return "bg-primary";
  if (tone === "secondary") return "bg-brand-secondary";
  if (value >= 80) return "bg-success";
  if (value >= 55) return "bg-primary";
  return "bg-warning";
}

export interface MetricBarProps {
  label: string;
  /** 0–100. */
  value: number;
  /** Optional caption shown under the track. */
  hint?: string;
  tone?: Tone;
  delay?: number;
  className?: string;
}

/**
 * A single scored dimension: label, animated value, and a track that fills
 * with the house spring. Numbers count up so a score reads as a measurement
 * being taken rather than a static print-out.
 */
export function MetricBar({ label, value, hint, tone = "auto", delay = 0, className }: MetricBarProps) {
  const reduced = useReducedMotionPref();
  const clamped = Math.max(0, Math.min(100, Math.round(value)));

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <span className="text-xs font-semibold tabular-nums text-foreground">
          <CountUp to={clamped} suffix="%" duration={0.9} />
        </span>
      </div>
      <div
        className="h-1.5 overflow-hidden rounded-full bg-surface-secondary"
        role="progressbar"
        aria-label={label}
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <motion.div
          className={cn("h-full rounded-full", toneClass(clamped, tone))}
          initial={{ scaleX: 0 }}
          whileInView={{ scaleX: clamped / 100 }}
          viewport={{ once: true, amount: 0.6 }}
          transition={reduced ? { duration: 0 } : { ...springSoft, delay }}
          style={{ transformOrigin: "left" }}
        />
      </div>
      {hint && <p className="text-[11px] leading-snug text-muted-foreground">{hint}</p>}
    </div>
  );
}

export default MetricBar;
