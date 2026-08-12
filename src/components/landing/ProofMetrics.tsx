/**
 * ProofMetrics — interactive, stateful proof section.
 *
 * The visitor picks a scenario (student, career changer, professional) and the
 * metric row recomputes: match score, time saved, interview readiness and
 * applications shipped all count up to the new values with a spring-timed
 * counter. Reduced motion snaps to the final value instead of animating.
 */
import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { GraduationCap, Compass, Rocket, TrendingUp, Clock, Mic, Send } from "lucide-react";
import { ease } from "@/lib/motion";

type Scenario = {
  id: string;
  label: string;
  icon: typeof Rocket;
  blurb: string;
  metrics: { matchScore: number; hoursSaved: number; readiness: number; applications: number };
  before: { matchScore: number; readiness: number };
};

const SCENARIOS: Scenario[] = [
  {
    id: "student",
    label: "Student",
    icon: GraduationCap,
    blurb: "First serious resume, no internship history, recruiting season in six weeks.",
    metrics: { matchScore: 78, hoursSaved: 9, readiness: 71, applications: 14 },
    before: { matchScore: 41, readiness: 22 },
  },
  {
    id: "changer",
    label: "Career changer",
    icon: Compass,
    blurb: "Eight years in one field, translating that experience into a new one.",
    metrics: { matchScore: 84, hoursSaved: 16, readiness: 79, applications: 23 },
    before: { matchScore: 47, readiness: 34 },
  },
  {
    id: "pro",
    label: "Professional",
    icon: Rocket,
    blurb: "Targeted search: fewer roles, higher bar, harder interview rooms.",
    metrics: { matchScore: 91, hoursSaved: 22, readiness: 88, applications: 11 },
    before: { matchScore: 63, readiness: 51 },
  },
];

/** Eased count-up that re-runs whenever the target changes. */
function useCount(target: number, reduce: boolean | null) {
  const [value, setValue] = useState(target);
  const from = useRef(target);

  useEffect(() => {
    if (reduce) {
      from.current = target;
      setValue(target);
      return;
    }
    const start = performance.now();
    const origin = from.current;
    const delta = target - origin;
    const dur = 900;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(origin + delta * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
      else from.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, reduce]);

  return value;
}

function Metric({
  icon: Icon,
  label,
  value,
  suffix = "",
  caption,
  progress,
}: {
  icon: typeof Rocket;
  label: string;
  value: number;
  suffix?: string;
  caption: string;
  progress?: number;
}) {
  const reduce = useReducedMotion();
  const shown = useCount(value, reduce);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border/70 bg-card/60 p-5 backdrop-blur-xl">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4 shrink-0 text-primary" aria-hidden />
        <span className="truncate text-[11px] font-semibold uppercase tracking-[0.16em]">{label}</span>
      </div>
      <p className="mt-3 font-display text-3xl font-bold tabular-nums tracking-tight text-foreground sm:text-4xl">
        {Math.round(shown)}
        <span className="text-lg text-muted-foreground">{suffix}</span>
      </p>
      {progress !== undefined && (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-secondary/60">
          <motion.div
            className="h-full rounded-full bg-primary"
            animate={{ width: `${Math.min(100, progress)}%` }}
            transition={reduce ? { duration: 0 } : { duration: 0.9, ease: ease.entrance }}
          />
        </div>
      )}
      <p className="mt-3 text-xs leading-snug text-muted-foreground">{caption}</p>
    </div>
  );
}

export function ProofMetrics() {
  const reduce = useReducedMotion();
  const [active, setActive] = useState(SCENARIOS[1]);

  return (
    <div className="space-y-8">
      <div
        role="tablist"
        aria-label="Career scenario"
        className="inline-flex w-full flex-wrap gap-1 rounded-2xl border border-border bg-secondary/40 p-1 sm:w-auto"
      >
        {SCENARIOS.map((s) => {
          const isActive = s.id === active.id;
          return (
            <button
              key={s.id}
              role="tab"
              type="button"
              aria-selected={isActive}
              onClick={() => setActive(s)}
              className={`relative min-h-11 flex-1 rounded-xl px-4 text-sm font-medium transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring sm:flex-none ${
                isActive ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {isActive && (
                <motion.span
                  layoutId="proof-pill"
                  className="absolute inset-0 rounded-xl bg-primary"
                  transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 34 }}
                />
              )}
              <span className="relative z-10 flex items-center justify-center gap-2">
                <s.icon className="h-4 w-4 shrink-0" aria-hidden />
                {s.label}
              </span>
            </button>
          );
        })}
      </div>

      <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">{active.blurb}</p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          icon={TrendingUp}
          label="Match score"
          value={active.metrics.matchScore}
          progress={active.metrics.matchScore}
          caption={`Up from ${active.before.matchScore} on the first upload.`}
        />
        <Metric
          icon={Clock}
          label="Time saved"
          value={active.metrics.hoursSaved}
          suffix="h"
          caption="Per month, versus tailoring each application by hand."
        />
        <Metric
          icon={Mic}
          label="Interview readiness"
          value={active.metrics.readiness}
          progress={active.metrics.readiness}
          caption={`Scored across structure, depth and delivery. Was ${active.before.readiness}.`}
        />
        <Metric
          icon={Send}
          label="Applications shipped"
          value={active.metrics.applications}
          caption="Complete packages — resume pass, cover letter, outreach."
        />
      </div>
    </div>
  );
}

export default ProofMetrics;
