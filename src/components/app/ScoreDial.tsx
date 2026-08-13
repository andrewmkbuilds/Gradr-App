import { motion } from "motion/react";
import { CountUp } from "@/components/motion";
import { useReducedMotionPref } from "@/hooks/useMotionPreference";
import { springSoft } from "@/lib/motion/tokens";
import { cn } from "@/lib/utils";

export interface ScoreDialProps {
  /** 0–100. */
  score: number;
  size?: number;
  label?: string;
  /** Short verdict rendered under the number. */
  caption?: string;
  className?: string;
}

function stroke(score: number) {
  if (score >= 80) return "hsl(var(--success))";
  if (score >= 55) return "hsl(var(--primary))";
  return "hsl(var(--warning))";
}

/**
 * The house score visualisation: a 270° arc that sweeps into place on the
 * heavy product spring, with a soft halo tinted to the verdict. Used wherever
 * Gradr puts a number on your work.
 */
export function ScoreDial({ score, size = 168, label, caption, className }: ScoreDialProps) {
  const reduced = useReducedMotionPref();
  const value = Math.max(0, Math.min(100, Math.round(score)));
  const width = Math.max(6, size * 0.055);
  const radius = (size - width) / 2;
  const sweep = 0.75; // 270° dial, opening at the bottom.
  const circumference = 2 * Math.PI * radius;
  const arc = circumference * sweep;
  const color = stroke(value);

  return (
    <div className={cn("flex flex-col items-center gap-3", className)}>
      <div className="relative" style={{ width: size, height: size }}>
        <div
          aria-hidden="true"
          className="absolute inset-[12%] rounded-full blur-2xl"
          style={{ background: color, opacity: 0.16 }}
        />
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="relative"
          style={{ transform: "rotate(135deg)" }}
          role="img"
          aria-label={`${label ?? "Score"}: ${value} out of 100`}
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="hsl(var(--border))"
            strokeWidth={width}
            strokeLinecap="round"
            strokeDasharray={`${arc} ${circumference}`}
          />
          <motion.circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={width}
            strokeLinecap="round"
            strokeDasharray={`${arc} ${circumference}`}
            initial={{ strokeDashoffset: arc }}
            whileInView={{ strokeDashoffset: arc * (1 - value / 100) }}
            viewport={{ once: true, amount: 0.5 }}
            transition={reduced ? { duration: 0 } : springSoft}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display text-4xl leading-none tracking-tight text-foreground">
            <CountUp to={value} duration={1.1} />
          </span>
          {label && (
            <span className="mt-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              {label}
            </span>
          )}
        </div>
      </div>
      {caption && <p className="max-w-[16rem] text-center text-xs text-muted-foreground">{caption}</p>}
    </div>
  );
}

export default ScoreDial;
