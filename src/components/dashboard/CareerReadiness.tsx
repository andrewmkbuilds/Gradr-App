import { useReducedMotionPref } from "@/hooks/useMotionPreference";
import { motion } from "motion/react";
import { CountUp } from "@/components/motion";
import { easeOut } from "@/lib/motion/tokens";
import { Surface } from "@/components/ui/surface";
import { DepthStage, DepthLayer } from "@/components/motion/Depth";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { ChevronDown, ChevronRight, Info } from "lucide-react";
import { PillarDrilldown } from "./PillarDrilldown";

export interface ReadinessPillar {
  key: string;
  label: string;
  /** 0-100 */
  value: number;
  /** Relative weight in the composite score. */
  weight: number;
  hint: string;
  /** Raw data signals behind the number, shown in the "why this score" panel. */
  signals?: { label: string; value: string }[];
  /** Concrete next actions surfaced in the pillar drill-down. */
  actions?: { label: string; detail?: string; to?: string }[];
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
  const reduced = useReducedMotionPref();
  const [explain, setExplain] = useState(false);
  const [active, setActive] = useState<ReadinessPillar | null>(null);
  const score = computeReadiness(pillars);
  const totalWeight = pillars.reduce((a, p) => a + p.weight, 0) || 1;
  const state = band(score);

  const size = 200;
  const stroke = 14;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  // Three-quarter dial (270°) leaves a readable base gap.
  const arcSpan = 0.75;
  const arcLength = circumference * arcSpan;

  return (
    <DepthStage className="rounded-2xl" tilt={4} sheen={false}>
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

      <div className="mt-4 flex flex-col items-center gap-5 sm:flex-row sm:items-center sm:gap-6">
        <DepthLayer
          z={40}
          className="relative aspect-square w-[min(180px,55vw)] shrink-0 sm:w-[200px]"
        >
          <svg
            width="100%"
            height="100%"
            viewBox={`0 0 ${size} ${size}`}
            className="-rotate-[225deg]"
            role="img"
            aria-label={`Career readiness score ${score} out of 100 — ${state.label}`}
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
            <span className="font-display text-4xl font-bold leading-none tracking-tight text-foreground sm:text-5xl">
              <CountUp to={score} duration={1.4} />
            </span>
            <span className="mt-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground sm:text-[11px]">
              readiness
            </span>
          </div>
        </DepthLayer>

        <DepthLayer z={18} className="w-full space-y-2">
          {pillars.map((p, i) => {
            const v = clamp(p.value);
            return (
              <button
                key={p.key}
                type="button"
                onClick={() => setActive(p)}
                aria-haspopup="dialog"
                aria-label={`${p.label}: ${v} out of 100. Open factors and next actions.`}
                className="focus-visible:ring-ring -mx-2 block w-[calc(100%+1rem)] rounded-lg px-2 py-2 text-left transition-colors hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2"
              >
                <div className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="font-medium text-foreground">{p.label}</span>
                  <span className="inline-flex items-center gap-1 tabular-nums text-muted-foreground">
                    {v}%
                    <ChevronRight className="h-3.5 w-3.5 text-mahogany" aria-hidden="true" />
                  </span>
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
              </button>
            );
          })}
        </DepthLayer>
      </div>

      <PillarDrilldown
        pillar={active}
        totalWeight={totalWeight}
        onOpenChange={(open) => !open && setActive(null)}
      />


      <div className="mt-5 border-t border-border/60 pt-4">
        <button
          type="button"
          onClick={() => setExplain((v) => !v)}
          aria-expanded={explain}
          aria-controls="readiness-explainer"
          className="flex min-h-11 w-full items-center justify-between gap-2 text-left text-xs font-medium text-mahogany hover:text-mahogany-hover"
        >
          <span className="inline-flex items-center gap-1.5">
            <Info className="h-3.5 w-3.5" aria-hidden="true" /> Why this score?
          </span>
          <ChevronDown className={cn("h-4 w-4 transition-transform", explain && "rotate-180")} aria-hidden="true" />
        </button>

        {explain && (
          <div id="readiness-explainer" className="mt-3 space-y-3">
            <p className="text-xs leading-relaxed text-muted-foreground">
              Readiness is a weighted average of four pillars. Each pillar is scored 0–100 from your own data, multiplied
              by its weight, then divided by the total weight ({totalWeight}).
            </p>
            <ul className="space-y-2">
              {pillars.map((p) => {
                const v = clamp(p.value);
                const contribution = Math.round((v * p.weight) / totalWeight);
                return (
                  <li key={p.key} className="accent-panel rounded-lg p-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="text-xs font-medium text-foreground">{p.label}</span>
                      <span className="text-[11px] tabular-nums text-muted-foreground">
                        {v} × weight {p.weight} ÷ {totalWeight} = <span className="text-foreground">+{contribution} pts</span>
                      </span>
                    </div>
                    {p.signals && p.signals.length > 0 && (
                      <dl className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-2">
                        {p.signals.map((sig) => (
                          <div key={sig.label} className="flex items-baseline justify-between gap-2 text-[11px]">
                            <dt className="text-muted-foreground">{sig.label}</dt>
                            <dd className="tabular-nums text-foreground">{sig.value}</dd>
                          </div>
                        ))}
                      </dl>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </Surface>
    </DepthStage>
  );
}
