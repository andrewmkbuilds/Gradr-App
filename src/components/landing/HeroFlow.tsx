/**
 * Hero product visualization: the Gradr career intelligence flow.
 *
 * Resume → AI analysis → ATS score → Job match → Interview → Progress.
 * The rail auto-advances, and every chip is a real control that jumps the
 * panel to that stage (no decorative dead UI).
 */
import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  FileText, Sparkles, ShieldCheck, Target, Mic, TrendingUp, Check, ArrowUpRight,
} from "lucide-react";
import { CountUp, DepthScene, DepthLayer } from "@/components/motion";
import { ease, spring } from "@/lib/motion";

const STAGES = [
  { key: "resume", label: "Resume", icon: FileText },
  { key: "analysis", label: "AI analysis", icon: Sparkles },
  { key: "ats", label: "ATS score", icon: ShieldCheck },
  { key: "match", label: "Job match", icon: Target },
  { key: "interview", label: "Interview", icon: Mic },
  { key: "progress", label: "Progress", icon: TrendingUp },
] as const;

type StageKey = (typeof STAGES)[number]["key"];

function Panel({ children, title, meta }: { children: React.ReactNode; title: string; meta?: string }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-3">
        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{title}</span>
        {meta ? <span className="text-[11px] text-primary">{meta}</span> : null}
      </div>
      <div className="flex-1 p-4">{children}</div>
    </div>
  );
}

function Bar({ label, value, delay = 0, tone = "primary" }: { label: string; value: number; delay?: number; tone?: "primary" | "warn" }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-semibold text-foreground">{value}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
        <motion.div
          className={`h-full rounded-full ${tone === "warn" ? "bg-amber-400" : "bg-primary"}`}
          initial={{ width: 0 }}
          animate={{ width: `${value}%` }}
          transition={{ delay, duration: 0.9, ease: ease.entrance }}
        />
      </div>
    </div>
  );
}

function StageBody({ stage }: { stage: StageKey }) {
  const reduce = useReducedMotion();

  if (stage === "resume") {
    return (
      <Panel title="Resume parsed" meta="amara-reid-resume.pdf">
        <div className="space-y-2">
          {["Senior Frontend Engineer · Northwind", "Led design-system rewrite for 40+ surfaces", "Cut p95 render time by 38%", "React · TypeScript · Design systems"].map((line, i) => (
            <motion.div
              key={line}
              className="flex items-start gap-2 rounded-lg border border-border/60 bg-secondary/30 px-3 py-2 text-[12px] text-muted-foreground"
              initial={reduce ? false : { opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.08, duration: 0.4, ease: ease.entrance }}
            >
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
              <span>{line}</span>
            </motion.div>
          ))}
        </div>
      </Panel>
    );
  }

  if (stage === "analysis") {
    return (
      <Panel title="AI analysis" meta="reading like a parser">
        <div className="space-y-3">
          {[
            ["Keyword coverage", 78],
            ["Impact language", 91],
            ["Structure", 64],
          ].map(([label, value], i) => (
            <Bar key={label as string} label={label as string} value={value as number} delay={i * 0.12} tone={(value as number) < 70 ? "warn" : "primary"} />
          ))}
          <div className="rounded-lg border border-primary/25 bg-primary/[0.06] px-3 py-2 text-[12px] text-foreground">
            Add “design systems” and “accessibility” — both appear in 8 of your 10 target roles.
          </div>
        </div>
      </Panel>
    );
  }

  if (stage === "ats") {
    return (
      <Panel title="ATS score" meta="after rewrite">
        <div className="flex items-center gap-5">
          <div className="relative grid h-24 w-24 shrink-0 place-items-center">
            <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90">
              <circle cx="50" cy="50" r="42" fill="none" stroke="hsl(var(--secondary))" strokeWidth="8" />
              <motion.circle
                cx="50" cy="50" r="42" fill="none" stroke="hsl(var(--primary))" strokeWidth="8" strokeLinecap="round"
                strokeDasharray={264}
                initial={{ strokeDashoffset: 264 }}
                animate={{ strokeDashoffset: 264 - 264 * 0.86 }}
                transition={{ duration: 1.1, ease: ease.entrance }}
              />
            </svg>
            <span className="font-display text-2xl font-bold">
              <CountUp value={86} />
            </span>
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <Bar label="Parse rate" value={98} />
            <Bar label="Keyword match" value={84} delay={0.1} />
            <p className="text-[11px] text-muted-foreground">+22 points from the version you uploaded.</p>
          </div>
        </div>
      </Panel>
    );
  }

  if (stage === "match") {
    return (
      <Panel title="Live matches" meta="ranked by real fit">
        <div className="space-y-2">
          {[
            ["Software Engineer", "Northwind", 92],
            ["Product Engineer", "Volta", 87],
            ["Frontend Developer", "Kestrel", 81],
          ].map(([role, co, score], i) => (
            <motion.div
              key={role as string}
              className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-secondary/30 px-3 py-2.5"
              initial={reduce ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.09, duration: 0.45, ease: ease.entrance }}
            >
              <div className="min-w-0">
                <p className="truncate text-[12px] font-medium text-foreground">{role as string}</p>
                <p className="truncate text-[11px] text-muted-foreground">{co as string}</p>
              </div>
              <span className="shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-primary">
                {score as number}%
              </span>
            </motion.div>
          ))}
        </div>
      </Panel>
    );
  }

  if (stage === "interview") {
    return (
      <Panel title="Live mock interview" meta="System design · Senior">
        <div className="space-y-3">
          <div className="flex h-12 items-end gap-1 rounded-lg border border-border/60 bg-secondary/30 px-3 py-2">
            {Array.from({ length: 28 }).map((_, i) => (
              <motion.span
                key={i}
                className="w-full rounded-sm bg-primary/70"
                initial={{ height: 4 }}
                animate={reduce ? { height: 12 } : { height: [4, 6 + ((i * 7) % 22), 4] }}
                transition={{ duration: 1.1 + (i % 5) * 0.14, repeat: reduce ? 0 : Infinity, ease: "easeInOut", delay: i * 0.03 }}
              />
            ))}
          </div>
          <p className="rounded-lg border border-border/60 bg-card px-3 py-2 text-[12px] leading-relaxed text-muted-foreground">
            “Walk me through how you'd keep that design system consistent across 40 surfaces without blocking teams.”
          </p>
          <div className="grid grid-cols-3 gap-2">
            {[["Clarity", 8.4], ["Structure", 7.9], ["Depth", 8.1]].map(([k, v]) => (
              <div key={k as string} className="rounded-lg border border-border/60 bg-secondary/30 px-2 py-1.5 text-center">
                <p className="font-display text-sm font-bold text-foreground">{v as number}</p>
                <p className="text-[10px] text-muted-foreground">{k as string}</p>
              </div>
            ))}
          </div>
        </div>
      </Panel>
    );
  }

  return (
    <Panel title="Career progress" meta="last 6 weeks">
      <div className="space-y-3">
        <div className="flex h-20 items-end gap-1.5">
          {[32, 41, 38, 56, 64, 72, 81, 86].map((h, i) => (
            <motion.div
              key={i}
              className="flex-1 rounded-t-md bg-linear-to-t from-primary/25 to-primary"
              initial={{ height: 0 }}
              animate={{ height: `${h}%` }}
              transition={{ delay: i * 0.06, duration: 0.6, ease: ease.entrance }}
            />
          ))}
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          {[["Interviews", 12], ["Offers", 3], ["Readiness", 91]].map(([k, v]) => (
            <div key={k as string} className="rounded-lg border border-border/60 bg-secondary/30 px-2 py-2">
              <p className="font-display text-base font-bold text-foreground"><CountUp value={v as number} /></p>
              <p className="text-[10px] text-muted-foreground">{k as string}</p>
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );
}

export function HeroFlow() {
  const reduce = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [pinned, setPinned] = useState(false);

  useEffect(() => {
    if (reduce || pinned) return;
    const t = window.setInterval(() => setIndex((i) => (i + 1) % STAGES.length), 3600);
    return () => window.clearInterval(t);
  }, [reduce, pinned]);

  const stage = STAGES[index]!;

  return (
    <DepthScene className="relative w-full" tilt={4} perspective={1500}>
      {/* main product surface */}
      <DepthLayer depth={0.6}>
        <div className="glass-panel edge-light relative overflow-hidden rounded-2xl bg-card/85 backdrop-blur-xl">
          <div className="flex items-center gap-2 border-b border-border/60 px-4 py-3">
            <span className="h-2.5 w-2.5 rounded-full bg-red-400/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-400/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" />
            <span className="ml-2 truncate text-[11px] text-muted-foreground">gradr — career workspace</span>
          </div>

          <div className="grid gap-0 sm:grid-cols-[13rem_minmax(0,1fr)]">
            {/* flow rail — real controls */}
            <div className="flex gap-1.5 overflow-x-auto border-b border-border/60 p-3 sm:flex-col sm:overflow-visible sm:border-b-0 sm:border-r">
              {STAGES.map((s, i) => {
                const activeStage = i === index;
                return (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => { setIndex(i); setPinned(true); }}
                    aria-pressed={activeStage}
                    className={`relative flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-left text-[12px] transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring ${
                      activeStage ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {activeStage && (
                      <motion.span
                        layoutId="hero-stage"
                        className="absolute inset-0 -z-10 rounded-xl bg-primary/12 ring-1 ring-primary/25"
                        transition={reduce ? { duration: 0 } : spring.smooth}
                      />
                    )}
                    <s.icon className={`h-3.5 w-3.5 shrink-0 ${activeStage ? "text-primary" : ""}`} aria-hidden />
                    <span className="whitespace-nowrap">{s.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="min-h-[16rem]">
              <AnimatePresence mode="wait">
                <motion.div
                  key={stage.key}
                  initial={reduce ? false : { opacity: 0, y: 12, filter: "blur(6px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  exit={reduce ? undefined : { opacity: 0, y: -10, filter: "blur(6px)" }}
                  transition={{ duration: 0.4, ease: ease.standard }}
                  className="h-full"
                >
                  <StageBody stage={stage.key} />
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </div>
      </DepthLayer>

      {/* floating satellites */}
      <DepthLayer depth={1.5} className="pointer-events-none absolute -left-10 bottom-4 hidden w-44 xl:block">
        <motion.div
          className="glass-panel rounded-xl bg-card/90 px-3 py-2.5 backdrop-blur-xl"
          animate={reduce ? undefined : { y: [0, -8, 0] }}
          transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
        >
          <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Skill gap closed</p>
          <p className="mt-1 flex items-center gap-1 font-display text-lg font-bold">
            <ArrowUpRight className="h-4 w-4 text-primary" aria-hidden />
            <CountUp value={4} /> <span className="text-xs font-medium text-muted-foreground">of 6</span>
          </p>
        </motion.div>
      </DepthLayer>

      <DepthLayer depth={1.8} className="pointer-events-none absolute -right-3 -top-5 hidden w-44 md:block">
        <motion.div
          className="glass-panel rounded-xl bg-card/90 px-3 py-2.5 backdrop-blur-xl"
          animate={reduce ? undefined : { y: [0, 9, 0] }}
          transition={{ duration: 8.5, repeat: Infinity, ease: "easeInOut", delay: 1 }}
        >
          <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Interview readiness</p>
          <p className="mt-1 font-display text-lg font-bold text-primary">
            <CountUp value={91} suffix="%" />
          </p>
        </motion.div>
      </DepthLayer>
    </DepthScene>
  );
}
