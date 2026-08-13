/**
 * Interactive product demonstrations for the Gradr landing page.
 *
 * Each demo is a *live* miniature of the real product surface — it runs its own
 * timeline (score counting, keywords highlighting, match bars calculating,
 * transcript streaming) rather than showing a static screenshot. The tab bar
 * uses a shared-layout indicator so switching feels physically connected.
 *
 * Motion rules: transforms + opacity only, timelines pause when off-screen,
 * and everything collapses to its final state under prefers-reduced-motion.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AnimatePresence,
  motion,
  useInView,
  useReducedMotion,
} from "framer-motion";
import {
  AlertTriangle,
  ArrowUpRight,
  Briefcase,
  Check,
  FileText,
  Mic,
  Sparkles,
  Target,
  TrendingUp,
} from "lucide-react";
import { CountUp, MotionMeter , DepthScene, DepthLayer } from "@/components/motion";
import { ease, spring } from "@/lib/motion";
import { cn } from "@/lib/utils";

/* --------------------------------- shell ---------------------------------- */

const TABS = [
  { id: "resume", label: "Resume Intelligence", icon: FileText },
  { id: "match", label: "Job Matching", icon: Target },
  { id: "interview", label: "AI Interview", icon: Mic },
  { id: "career", label: "Career Intelligence", icon: TrendingUp },
] as const;

type TabId = (typeof TABS)[number]["id"];

const COPY: Record<TabId, { title: string; body: string }> = {
  resume: {
    title: "Your resume, read the way a hiring system reads it.",
    body: "Gradr parses the document, scores it against the role, surfaces the keywords that are missing, and rewrites the lines that are costing you interviews.",
  },
  match: {
    title: "Matches that explain themselves.",
    body: "Every role is scored against your actual profile — skills, seniority, location, and trajectory — with the reasoning visible instead of a black-box percentage.",
  },
  interview: {
    title: "A mock interview that behaves like the real one.",
    body: "Live voice, live transcript, live scoring. The coach interrupts, follows up, and grades structure, signal and delivery as you speak.",
  },
  career: {
    title: "The path from where you are to where you're going.",
    body: "Gradr maps your current skills onto target roles, shows the gaps that matter, and sequences the moves that close them.",
  },
};

export function ProductDemos() {
  const [tab, setTab] = useState<TabId>("resume");

  return (
    <div className="grain relative">
      {/* Tab bar — shared-layout pill glides between items. */}
      <div className="relative -mx-5 overflow-x-auto px-5 pb-2 sm:mx-0 sm:overflow-visible sm:px-0">
        <div
          role="tablist"
          aria-label="Gradr product demonstrations"
          className="glass-panel inline-flex min-w-max gap-1 rounded-full p-1.5"
        >
          {TABS.map((t) => {
            const active = t.id === tab;
            return (
              <button
                key={t.id}
                role="tab"
                aria-selected={active}
                onClick={() => setTab(t.id)}
                className={cn(
                  "relative flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-medium transition-colors",
                  active ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {active && (
                  <motion.span
                    layoutId="demo-tab-pill"
                    transition={spring.smooth}
                    className="absolute inset-0 rounded-full bg-primary"
                    aria-hidden
                  />
                )}
                <t.icon className="relative h-4 w-4 shrink-0" aria-hidden />
                <span className="relative whitespace-nowrap">{t.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-center lg:gap-12">
        <AnimatePresence mode="wait">
          <motion.div
            key={`${tab}-copy`}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3, ease: ease.standard }}
            className="space-y-4"
          >
            <h3 className="display-sm text-foreground">{COPY[tab].title}</h3>
            <p className="text-sm leading-relaxed text-muted-foreground sm:text-base">{COPY[tab].body}</p>
          </motion.div>
        </AnimatePresence>

        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 18, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.99 }}
            transition={{ duration: 0.36, ease: ease.entrance }}
          >
            <DemoFrame>
              {tab === "resume" && <ResumeDemo />}
              {tab === "match" && <MatchDemo />}
              {tab === "interview" && <InterviewDemo />}
              {tab === "career" && <CareerDemo />}
            </DemoFrame>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

/** Product chrome: window bar + glass body. */
function DemoFrame({ children }: { children: React.ReactNode }) {
  return (
    <DepthScene tilt={3} perspective={1600}>
      <DepthLayer depth={1}>
        <div className="glass-panel edge-light reflect overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border/70 px-4 py-3">
        <span className="h-2.5 w-2.5 rounded-full bg-destructive/60" aria-hidden />
        <span className="h-2.5 w-2.5 rounded-full bg-warning/60" aria-hidden />
        <span className="h-2.5 w-2.5 rounded-full bg-success/60" aria-hidden />
        <span className="ml-2 text-[11px] tracking-wide text-muted-foreground">gradr — live demo</span>
      </div>
          <div className="p-4 sm:p-5">{children}</div>
        </div>
      </DepthLayer>
    </DepthScene>
  );
}

/** Runs a stepped timeline while visible; returns the current step index. */
function useTimeline(steps: number, intervalMs: number) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { margin: "0px 0px -15% 0px" });
  const [step, setStep] = useState(reduce ? steps - 1 : 0);

  useEffect(() => {
    if (reduce || !inView) return;
    const id = window.setInterval(() => setStep((s) => (s + 1) % (steps + 1)), intervalMs);
    return () => window.clearInterval(id);
  }, [inView, reduce, steps, intervalMs]);

  return { ref, step, reduce };
}

/* ---------------------------- resume intelligence -------------------------- */

const RESUME_LINES = [
  { text: "Senior Frontend Engineer · Northwind", tone: "head" },
  { text: "Owned migration of checkout to React 19", tone: "ok" },
  { text: "Responsible for various team tasks", tone: "issue" },
  { text: "Cut p95 render time by 41% across 3 apps", tone: "ok" },
  { text: "Helped with performance improvements", tone: "issue" },
] as const;

const KEYWORDS = ["TypeScript", "Design systems", "A/B testing", "Accessibility", "Observability"];

function ResumeDemo() {
  const { ref, step } = useTimeline(4, 1600);

  return (
    <div ref={ref} className="grid gap-4 sm:grid-cols-[1.15fr_1fr]">
      {/* document */}
      <div className="depth-surface reflect relative rounded-xl border border-border/70 bg-background/60 p-3">
        <div className="mb-3 flex items-center gap-2 text-[11px] text-muted-foreground">
          <FileText className="h-3.5 w-3.5 text-primary" aria-hidden />
          amara-reid-resume.pdf
          <motion.span
            className="ml-auto rounded-full bg-primary/12 px-2 py-0.5 text-[10px] font-medium text-primary"
            animate={{ opacity: step >= 1 ? 1 : 0.35 }}
          >
            {step >= 1 ? "Parsed" : "Parsing…"}
          </motion.span>
        </div>

        <ul className="space-y-1.5">
          {RESUME_LINES.map((l, i) => (
            <motion.li
              key={l.text}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.08 * i, duration: 0.35, ease: ease.entrance }}
              className={cn(
                "rounded-md px-2 py-1.5 text-[11px] leading-snug transition-colors duration-500",
                l.tone === "head" && "font-semibold text-foreground",
                l.tone === "ok" && "text-muted-foreground",
                l.tone === "issue" && step >= 3
                  ? "bg-warning/12 text-warning ring-1 ring-warning/30"
                  : l.tone === "issue"
                    ? "text-muted-foreground"
                    : "",
              )}
            >
              <span className="flex items-start gap-2">
                <span className="flex-1">{l.text}</span>
                {l.tone === "issue" && step >= 3 && (
                  <motion.span initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }}>
                    <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden />
                  </motion.span>
                )}
              </span>
            </motion.li>
          ))}
        </ul>
      </div>

      {/* analysis */}
      <div className="space-y-3">
        <div className="depth-surface reflect relative rounded-xl border border-border/70 bg-background/60 p-3">
          <div className="flex items-baseline justify-between">
            <span className="label-wide text-muted-foreground">ATS score</span>
            <span className="font-display text-3xl font-bold text-primary">
              {step >= 2 ? <CountUp value={86} /> : <span className="numeric opacity-40">—</span>}
            </span>
          </div>
          <div className="mt-3 space-y-2">
            {[
              { label: "Keywords", value: 78, tone: "primary" as const },
              { label: "Impact", value: 91, tone: "success" as const },
              { label: "Formatting", value: 64, tone: "warning" as const },
            ].map((m, i) => (
              <div key={m.label}>
                <div className="mb-1 flex justify-between text-[10px] text-muted-foreground">
                  <span>{m.label}</span>
                  <span className="numeric">{step >= 2 ? m.value : 0}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                  <motion.div
                    className={cn(
                      "h-full rounded-full",
                      m.tone === "primary" && "bg-primary",
                      m.tone === "success" && "bg-success",
                      m.tone === "warning" && "bg-warning",
                    )}
                    animate={{ width: step >= 2 ? `${m.value}%` : "0%" }}
                    transition={{ duration: 0.8, ease: ease.entrance, delay: i * 0.08 }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="depth-surface reflect relative rounded-xl border border-border/70 bg-background/60 p-3">
          <span className="label-wide text-muted-foreground">Missing keywords</span>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {KEYWORDS.map((k, i) => (
              <motion.span
                key={k}
                animate={{
                  opacity: step >= 3 ? 1 : 0.25,
                  scale: step >= 3 ? 1 : 0.96,
                }}
                transition={{ delay: step >= 3 ? i * 0.07 : 0, ...spring.snappy }}
                className="rounded-md border border-primary/25 bg-primary/10 px-2 py-1 text-[10px] text-primary"
              >
                {k}
              </motion.span>
            ))}
          </div>
        </div>

        <AnimatePresence>
          {step >= 4 && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={spring.smooth}
              className="lume-border rounded-xl border border-primary/25 bg-primary/[0.07] p-3"
              data-active="true"
            >
              <span className="flex items-center gap-2 text-[11px] font-medium text-primary">
                <Sparkles className="h-3.5 w-3.5" aria-hidden /> AI rewrite
              </span>
              <p className="mt-1.5 text-[11px] leading-relaxed text-foreground">
                “Led performance workstream across 3 apps — cut p95 render time 41% and shipped an accessibility
                baseline adopted by 6 teams.”
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

/* -------------------------------- matching -------------------------------- */

const JOBS = [
  { role: "Senior Frontend Engineer", co: "Northwind", score: 94, skills: ["React", "TypeScript", "Design systems"] },
  { role: "Product Engineer", co: "Volta", score: 87, skills: ["React", "Node", "Experimentation"] },
  { role: "Frontend Lead", co: "Kestrel", score: 79, skills: ["Leadership", "React", "Perf"] },
];

function MatchDemo() {
  const { ref, step } = useTimeline(3, 1500);

  return (
    <div ref={ref} className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="label-wide text-muted-foreground">Live matches</span>
        <motion.span
          className="flex items-center gap-1.5 text-[10px] text-primary"
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden />
          Scoring against your profile
        </motion.span>
      </div>

      {JOBS.map((j, i) => (
        <motion.div
          key={j.role}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.12, duration: 0.4, ease: ease.entrance }}
          whileHover={{ y: -2 }}
          className="lume-border rounded-xl border border-border/70 bg-background/60 p-3"
        >
          <div className="flex items-start gap-3">
            <div className="grid h-9 w-9 shrink-0 place-items-center extrude rounded-lg bg-primary/10 text-xs font-bold text-primary">
              {j.co[0]}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-foreground">{j.role}</p>
              <p className="text-[10px] text-muted-foreground">{j.co} · Remote · Full-time</p>
            </div>
            <div className="shrink-0 text-right">
              <div className="font-display text-lg font-bold text-primary">
                {step >= 1 ? <CountUp value={j.score} suffix="%" duration={0.9} /> : <span className="opacity-30">··</span>}
              </div>
              <span className="text-[9px] uppercase tracking-wider text-muted-foreground">match</span>
            </div>
          </div>

          <div className="mt-2.5">
            <MotionMeter value={step >= 1 ? j.score : 0} delay={i * 0.1} />
          </div>

          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {j.skills.map((s, si) => (
              <motion.span
                key={s}
                animate={{
                  opacity: step >= 2 ? 1 : 0.3,
                  borderColor: step >= 2 ? "hsl(var(--success) / 0.35)" : "hsl(var(--border))",
                }}
                transition={{ delay: si * 0.06 }}
                className="flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] text-muted-foreground"
              >
                {step >= 2 && <Check className="h-2.5 w-2.5 text-success" aria-hidden />}
                {s}
              </motion.span>
            ))}
          </div>
        </motion.div>
      ))}

      <AnimatePresence>
        {step >= 3 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-2 rounded-xl border border-primary/25 bg-primary/[0.07] px-3 py-2.5 text-[11px] text-foreground"
          >
            <Briefcase className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
            Northwind is your strongest fit — Gradr drafted a tailored resume and cover letter.
            <ArrowUpRight className="ml-auto h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------- ai interview ------------------------------ */

const TRANSCRIPT = [
  { who: "ai", text: "Walk me through a system you designed end to end." },
  { who: "you", text: "I led the checkout rewrite at Northwind — 3 services, 40k daily orders…" },
  { who: "ai", text: "What was the failure mode you were most worried about?" },
  { who: "you", text: "Double-charging under retry. We made the payment intent idempotent…" },
];

function InterviewDemo() {
  const { ref, step, reduce } = useTimeline(4, 1800);
  const bars = useMemo(() => Array.from({ length: 28 }, (_, i) => 0.25 + ((i * 37) % 70) / 100), []);
  const speaking = step % 2 === 1;

  return (
    <div ref={ref} className="grid gap-3 sm:grid-cols-[1fr_0.85fr]">
      <div className="space-y-3">
        {/* camera frame */}
        <div className="relative aspect-video overflow-hidden rounded-xl border border-border/70 bg-background/70">
          <div className="absolute inset-0 atmos" aria-hidden />
          <div className="absolute inset-0 grid place-items-center">
            <motion.div
              animate={reduce ? undefined : { scale: speaking ? [1, 1.05, 1] : 1 }}
              transition={{ duration: 1.6, repeat: speaking ? Infinity : 0 }}
              className="grid h-16 w-16 place-items-center rounded-full border border-primary/40 bg-primary/10"
            >
              <Mic className="h-6 w-6 text-primary" aria-hidden />
            </motion.div>
          </div>
          <span className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-background/80 px-2 py-1 text-[10px] text-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-destructive" aria-hidden /> REC
          </span>
          <span className="absolute right-3 top-3 rounded-full bg-background/80 px-2 py-1 text-[10px] text-muted-foreground">
            Eye contact 92%
          </span>

          {/* waveform */}
          <div className="absolute inset-x-3 bottom-3 flex h-8 items-end gap-[3px]">
            {bars.map((b, i) => (
              <motion.span
                key={i}
                className="flex-1 rounded-full bg-primary/70"
                animate={
                  reduce
                    ? { height: `${b * 60}%` }
                    : { height: speaking ? [`${b * 25}%`, `${b * 100}%`, `${b * 40}%`] : "12%" }
                }
                transition={{ duration: 0.8 + (i % 5) * 0.12, repeat: speaking ? Infinity : 0, ease: "easeInOut" }}
              />
            ))}
          </div>
        </div>

        {/* transcript */}
        <div className="h-[7.5rem] overflow-hidden rounded-xl border border-border/70 bg-background/60 p-3">
          <span className="label-wide text-muted-foreground">Live transcript</span>
          <div className="mt-2 space-y-1.5">
            {TRANSCRIPT.slice(0, Math.max(1, step + 1)).map((t) => (
              <motion.p
                key={t.text}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className={cn(
                  "text-[11px] leading-snug",
                  t.who === "ai" ? "text-primary" : "text-muted-foreground",
                )}
              >
                <span className="font-semibold">{t.who === "ai" ? "Coach" : "You"}:</span> {t.text}
              </motion.p>
            ))}
          </div>
        </div>
      </div>

      {/* metrics */}
      <div className="space-y-3">
        <div className="depth-surface reflect relative rounded-xl border border-border/70 bg-background/60 p-3 text-center">
          <span className="label-wide text-muted-foreground">Readiness</span>
          <div className="font-display text-4xl font-bold text-primary">
            {step >= 3 ? <CountUp value={8.4} decimals={1} /> : <span className="opacity-30">—</span>}
          </div>
          <span className="text-[10px] text-muted-foreground">/ 10 · System design</span>
        </div>

        {[
          { label: "Structure", v: 88 },
          { label: "Signal density", v: 76 },
          { label: "Delivery", v: 82 },
          { label: "Specificity", v: 71 },
        ].map((m, i) => (
          <div key={m.label} className="rounded-lg border border-border/70 bg-background/50 p-2.5">
            <div className="mb-1.5 flex justify-between text-[10px]">
              <span className="text-muted-foreground">{m.label}</span>
              <span className="numeric text-foreground">{step >= 2 ? m.v : 0}</span>
            </div>
            <MotionMeter value={step >= 2 ? m.v : 0} delay={i * 0.06} tone={m.v > 80 ? "success" : "primary"} />
          </div>
        ))}
      </div>
    </div>
  );
}

/* --------------------------- career intelligence --------------------------- */

const ROADMAP = [
  { stage: "Now", role: "Senior Frontend Engineer", done: true },
  { stage: "6 months", role: "Staff Engineer (Platform)", done: false },
  { stage: "18 months", role: "Principal / Eng Manager", done: false },
];

const GAPS = [
  { skill: "Distributed systems", have: 55, need: 85 },
  { skill: "Technical leadership", have: 70, need: 90 },
  { skill: "Platform architecture", have: 62, need: 88 },
];

function CareerDemo() {
  const { ref, step } = useTimeline(3, 1600);

  return (
    <div ref={ref} className="space-y-4">
      {/* roadmap */}
      <div className="relative rounded-xl border border-border/70 bg-background/60 p-4">
        <span className="label-wide text-muted-foreground">Career roadmap</span>
        <div className="relative mt-4 space-y-5 pl-5">
          <div className="absolute left-[7px] top-1 h-[calc(100%-0.5rem)] w-px bg-border" aria-hidden />
          <motion.div
            className="absolute left-[7px] top-1 w-px bg-primary"
            initial={{ height: 0 }}
            animate={{ height: step >= 1 ? "calc(100% - 0.5rem)" : 0 }}
            transition={{ duration: 1.1, ease: ease.entrance }}
            aria-hidden
          />
          {ROADMAP.map((r, i) => (
            <motion.div
              key={r.role}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.14, duration: 0.4, ease: ease.entrance }}
              className="relative"
            >
              <motion.span
                className={cn(
                  "absolute -left-5 top-1 grid h-[15px] w-[15px] place-items-center rounded-full border-2",
                  step >= 1 || r.done ? "border-primary bg-primary/25" : "border-border bg-background",
                )}
                animate={{ scale: step >= 1 ? [1, 1.25, 1] : 1 }}
                transition={{ delay: i * 0.2, duration: 0.5 }}
                aria-hidden
              />
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{r.stage}</p>
              <p className="text-xs font-semibold text-foreground">{r.role}</p>
            </motion.div>
          ))}
        </div>
      </div>

      {/* gaps */}
      <div className="depth-surface reflect relative rounded-xl border border-border/70 bg-background/60 p-4">
        <span className="label-wide text-muted-foreground">Skill gaps to close</span>
        <div className="mt-3 space-y-3">
          {GAPS.map((g, i) => (
            <div key={g.skill}>
              <div className="mb-1 flex justify-between text-[11px]">
                <span className="text-foreground">{g.skill}</span>
                <span className="numeric text-muted-foreground">
                  {step >= 2 ? `${g.have} → ${g.need}` : "—"}
                </span>
              </div>
              <div className="relative h-1.5 overflow-hidden rounded-full bg-secondary">
                <motion.div
                  className="absolute inset-y-0 left-0 rounded-full bg-brand-secondary/40"
                  animate={{ width: step >= 2 ? `${g.need}%` : "0%" }}
                  transition={{ duration: 0.9, ease: ease.entrance, delay: i * 0.08 }}
                />
                <motion.div
                  className="absolute inset-y-0 left-0 rounded-full bg-primary"
                  animate={{ width: step >= 1 ? `${g.have}%` : "0%" }}
                  transition={{ duration: 0.8, ease: ease.entrance, delay: i * 0.08 }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <AnimatePresence>
        {step >= 3 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex items-start gap-2 rounded-xl border border-primary/25 bg-primary/[0.07] px-3 py-2.5 text-[11px] leading-relaxed text-foreground"
          >
            <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
            Next move: own one platform-level project this quarter. Gradr drafted the pitch and the three roles it
            unlocks.
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default ProductDemos;
