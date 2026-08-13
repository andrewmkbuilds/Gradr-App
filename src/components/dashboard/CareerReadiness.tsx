import { motion, useReducedMotion } from "motion/react";
import { CountUp } from "@/components/motion";
import { easeOut } from "@/lib/motion/tokens";
import { Surface } from "@/components/ui/surface";
import { cn } from "@/lib/utils";

export interface ReadinessPillar {
  key: string;
  label: string;
  /** 0-100 */
  value: number;
  /** Relative weight in the composite score. */
  weight: number;
  hint: string;
}

export function computeReadiness(pillars: ReadinessPillar[]) {
  const totalWeight = pillars.reduce((a, p) => a + p.weight, 0) || 1;
  const score = pillars.reduce((a, p) => a + clamp(p.value) * p.weight, 0) / totalWeight;
  return Math.round(score);
}

function clamp(n: number) {
  return Math.max(0, Math.min(100, Math.round(n || 0)));
}

function band(score: number) {
  if (score >= 80) return { label: "Interview ready", tone: "text-success", ring: "hsl(var(--success))" };
  if (score >= 60) return { label: "Nearly there", tone: "text-primary", ring: "hsl(var(--primary))" };
  if (score >= 35) return { label: "Building momentum", tone: "text-warning", ring: "hsl(var(--warning))" };
  return { label: "Getting started", tone: "text-muted-foreground", ring: "hsl(var(--brand-secondary))" };
}

/**
 * Career Readiness: one composite number backed by weighted pillars, drawn as
 * a segmented arc so users can see which part of the search is holding them back.
 */
export function CareerReadiness({
  pillars,
  className,
}: {
  pillars: ReadinessPillar[];
  className?: string;
}) {
  const reduced = useReducedMotion();
  const score = computeReadiness(pillars);
  const state = band(score);

  const size = 200;
  const stroke = 14;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  // Three-quarter dial (270°) leaves a readable base gap.
  const arcSpan = 0.75;
  const arcLength = circumference * arcSpan;

  return (
    <Surface level={3} className={cn("relative overflow-hidden", className)}>
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-20 h-52 w-52 rounded-full bg-primary/10 blur-3xl"
      />

      <div className="mb-1 flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-foreground">Career Readiness</h3>
        <span className={cn("text-xs font-medium", state.tone)}>{state.label}</span>
      </div>
      <p className="text-xs text-muted-foreground">Weighted across resume, matching, activity and practice.</p>

      <div className="mt-4 flex flex-col items-center gap-6 sm:flex-row sm:items-center">
        <div className="relative shrink-0" style={{ width: size, height: size * 0.86 }}>
          <svg
            width={size}
            height={size}
            viewBox={`0 0 ${size} ${size}`}
            className="-rotate-[225deg]"
            role="img"
            aria-label={`Career readiness score ${score} out of 100`}
          >
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="hsl(var(--secondary))"
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={`${arcLength} ${circumference}`}
            />
            <motion.circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={state.ring}
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={`${arcLength} ${circumference}`}
              initial={{ strokeDashoffset: arcLength }}
              animate={{ strokeDashoffset: arcLength * (1 - score / 100) }}
              transition={reduced ? { duration: 0 } : { duration: 1.4, ease: easeOut }}
              style={{ filter: "drop-shadow(0 0 8px hsl(var(--primary) / 0.28))" }}
            />
          </svg>

          <div className="absolute inset-0 flex flex-col items-center justify-center pt-1">
            <span className="font-display text-5xl font-bold leading-none tracking-tight text-foreground">
              <CountUp to={score} duration={1.4} />
            </span>
            <span className="mt-1 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              readiness
            </span>
          </div>
        </div>

        <ul className="w-full space-y-3">
          {pillars.map((p, i) => {
            const v = clamp(p.value);
            return (
              <li key={p.key}>
                <div className="flex items-baseline justify-between text-xs">
                  <span className="font-medium text-foreground">{p.label}</span>
                  <span className="tabular-nums text-muted-foreground">{v}%</span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-secondary">
                  <motion.div
                    className="h-full rounded-full"
                    style={{
                      transformOrigin: "left",
                      background: `linear-gradient(90deg, hsl(var(--chart-${(i % 6) + 1})), hsl(var(--chart-${((i + 2) % 6) + 1})))`,
                    }}
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: v / 100 }}
                    transition={reduced ? { duration: 0 } : { duration: 1, ease: easeOut, delay: 0.15 + i * 0.08 }}
                  />
                </div>
                <p className="mt-1 text-[11px] leading-tight text-muted-foreground">{p.hint}</p>
              </li>
            );
          })}
        </ul>
      </div>
    </Surface>
  );
}
