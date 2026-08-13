import { useReducedMotionPref } from "@/hooks/useMotionPreference";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

interface Props {
  /** Seconds elapsed in the session. */
  elapsed: number;
  /** Session cap in minutes; omit for an untimed session. */
  limitMinutes?: number | null;
  className?: string;
}

function clock(sec: number) {
  const m = Math.floor(sec / 60).toString().padStart(2, "0");
  const s = Math.floor(sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

const SIZE = 56;
const STROKE = 3;
const R = (SIZE - STROKE) / 2;
const C = 2 * Math.PI * R;

/**
 * Compact session clock. The ring drains toward the session cap and turns
 * destructive on overtime, so the time pressure is felt without reading digits.
 */
export function SessionTimerRing({ elapsed, limitMinutes, className }: Props) {
  const reduced = useReducedMotionPref();
  const cap = limitMinutes ? limitMinutes * 60 : null;
  const progress = cap ? Math.min(1, elapsed / cap) : 0;
  const overtime = cap ? elapsed > cap : false;
  const warning = !overtime && progress > 0.8;

  return (
    <div className={cn("relative flex items-center justify-center", className)} style={{ width: SIZE, height: SIZE }}>
      <svg width={SIZE} height={SIZE} className="-rotate-90" aria-hidden="true">
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          fill="none"
          stroke="hsl(var(--border))"
          strokeWidth={STROKE}
        />
        {cap && (
          <motion.circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={R}
            fill="none"
            stroke={
              overtime
                ? "hsl(var(--destructive))"
                : warning
                  ? "hsl(var(--brand-secondary, var(--primary)))"
                  : "hsl(var(--primary))"
            }
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={C}
            initial={false}
            animate={{ strokeDashoffset: C * (1 - progress) }}
            transition={reduced ? { duration: 0 } : { duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
          />
        )}
      </svg>
      <span
        className={cn(
          "absolute font-mono text-[11px] font-semibold tabular-nums",
          overtime ? "text-destructive" : "text-foreground",
        )}
        aria-label={`Elapsed time ${clock(elapsed)}`}
      >
        {clock(elapsed)}
      </span>
    </div>
  );
}
