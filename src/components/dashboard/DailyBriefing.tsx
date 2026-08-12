import { ArrowRight, Sparkles, Flame, AlertTriangle, Target } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { useNavigate } from "@/lib/router-compat";
import { CountUp, MotionPressable } from "@/components/motion";
import { spring, stagger } from "@/lib/motion";
import type { Briefing, NextAction } from "@/lib/careerBriefing";
import { greeting } from "@/lib/careerBriefing";

const TONE: Record<NextAction["tone"], { ring: string; chip: string; icon: typeof Target }> = {
  critical: { ring: "border-destructive/40", chip: "bg-destructive/15 text-destructive", icon: AlertTriangle },
  primary: { ring: "border-primary/40", chip: "bg-primary/15 text-primary", icon: Sparkles },
  steady: { ring: "border-border", chip: "bg-secondary text-muted-foreground", icon: Target },
};

function ReadinessDial({ value }: { value: number }) {
  const reduce = useReducedMotion();
  const size = 132;
  const stroke = 10;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const tint = value >= 75 ? "hsl(var(--success))" : value >= 45 ? "hsl(var(--primary))" : "hsl(var(--warning))";

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="hsl(var(--border))" strokeWidth={stroke} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={tint}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: reduce ? c - (value / 100) * c : c }}
          animate={{ strokeDashoffset: c - (value / 100) * c }}
          transition={{ ...spring.soft, delay: 0.1 }}
          style={{ filter: `drop-shadow(0 0 10px color-mix(in oklab, ${tint} 45%, transparent))` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-4xl font-bold tracking-tight text-foreground">
          <CountUp value={value} duration={1} />
        </span>
        <span className="text-[0.65rem] uppercase tracking-[0.18em] text-muted-foreground">Readiness</span>
      </div>
    </div>
  );
}

export function DailyBriefing({ briefing, name }: { briefing: Briefing; name?: string | null }) {
  const navigate = useNavigate();
  const { weeklyGoal } = briefing;

  return (
    <section aria-labelledby="briefing-heading" className="lume-border glass-panel reflect relative overflow-hidden rounded-2xl">
      <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-primary/15 blur-3xl" aria-hidden />
      <div className="relative grid gap-6 p-6 lg:grid-cols-[auto_1fr] lg:p-8">
        <div className="flex items-center gap-6">
          <ReadinessDial value={briefing.readiness} />
          <div className="hidden w-40 space-y-2.5 sm:block lg:w-44">
            {briefing.breakdown.map((b) => (
              <div key={b.key}>
                <div className="flex justify-between text-[0.7rem]">
                  <span className="text-muted-foreground">{b.label}</span>
                  <span className="tabular-nums text-foreground">{b.value}</span>
                </div>
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-secondary">
                  <motion.div
                    className="h-full rounded-full bg-primary"
                    initial={{ width: 0 }}
                    animate={{ width: `${b.value}%` }}
                    transition={{ ...spring.soft, delay: 0.15 }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.2em] text-primary">
            {greeting()}
            {name ? `, ${name}` : ""}
          </p>
          <h1 id="briefing-heading" className="font-display mt-1 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            {briefing.headline}
          </h1>
          <p className="mt-1.5 max-w-xl text-sm text-muted-foreground">{briefing.summary}</p>

          <div className="mt-4 flex items-center gap-3 rounded-xl bg-secondary/50 px-3.5 py-2.5">
            <Flame className={`h-4 w-4 shrink-0 ${weeklyGoal.pct >= 100 ? "text-success" : "text-warning"}`} aria-hidden />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2 text-xs">
                <span className="text-foreground">Weekly application goal</span>
                <span className="tabular-nums text-muted-foreground">
                  {weeklyGoal.applied}/{weeklyGoal.target}
                </span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-background/60">
                <motion.div
                  className={`h-full rounded-full ${weeklyGoal.pct >= 100 ? "bg-success" : "bg-primary"}`}
                  initial={{ width: 0 }}
                  animate={{ width: `${weeklyGoal.pct}%` }}
                  transition={{ ...spring.soft, delay: 0.2 }}
                />
              </div>
            </div>
          </div>

          <motion.ul
            className="mt-5 space-y-2.5"
            initial="hidden"
            animate="visible"
            variants={{ visible: { transition: { staggerChildren: stagger.base, delayChildren: 0.1 } } }}
          >
            {briefing.actions.map((action) => {
              const tone = TONE[action.tone];
              const Icon = tone.icon;
              return (
                <motion.li
                  key={action.id}
                  variants={{ hidden: { opacity: 0, y: 10 }, visible: { opacity: 1, y: 0 } }}
                  transition={spring.smooth}
                >
                  <MotionPressable
                    onClick={() => navigate(action.to)}
                    className={`group flex w-full items-center gap-3 rounded-xl border ${tone.ring} bg-background/40 p-3.5 text-left transition-colors hover:bg-secondary/60`}
                  >
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${tone.chip}`}>
                      <Icon className="h-4 w-4" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">{action.label}</span>
                      <span className="block truncate text-xs text-muted-foreground">{action.reason}</span>
                    </span>
                    <span className="hidden shrink-0 items-center gap-1 text-xs font-medium text-primary sm:flex">
                      {action.cta}
                      <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
                    </span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-primary sm:hidden" aria-hidden />
                  </MotionPressable>
                </motion.li>
              );
            })}
          </motion.ul>
        </div>
      </div>
    </section>
  );
}
