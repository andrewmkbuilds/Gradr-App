import { useMemo, useState, useEffect, useRef, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Award, Braces, Check, FileText, Gauge, Layers, MapPin, Mic, Plus, Rocket,
  Sparkles, Target, TrendingUp, Wand2,
} from "lucide-react";
import { Surface } from "@/components/ui/surface";
import { useReducedMotionPref } from "@/hooks/useMotionPreference";
import { usePremiumInteractions } from "@/hooks/usePointerCapability";
import { duration, easeOut, springSmooth, springSnappy } from "@/lib/motion/tokens";
import { cn } from "@/lib/utils";

/**
 * Interactive engine demos.
 *
 * These are not looping videos or scripted animations: every control mutates
 * real state, every number is computed from that state, and the visuals
 * animate the delta. They stand in as the "try it" surface on the landing
 * page and as the empty state inside each engine, so a first-time user can
 * feel how the module behaves before they have any data.
 *
 * All motion is transform/opacity only and collapses to instant state changes
 * when motion is reduced. Pointer choreography is gated behind
 * `usePremiumInteractions()` so touch devices get press feedback instead.
 */

/* ------------------------------ shared parts ----------------------------- */

function DemoShell({
  eyebrow,
  title,
  hint,
  children,
  className,
}: {
  eyebrow: string;
  title: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Surface level={2} className={cn("overflow-hidden p-0", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 bg-surface-secondary/60 px-4 py-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-mahogany">{eyebrow}</p>
          <p className="truncate text-sm font-semibold text-foreground">{title}</p>
        </div>
        <span className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[10px] font-medium text-primary">
          Interactive
        </span>
      </div>
      <div className="space-y-4 p-4 sm:p-5">{children}</div>
      {hint && <p className="border-t border-border/60 px-4 py-2.5 text-xs text-muted-foreground">{hint}</p>}
    </Surface>
  );
}

/** Chip whose selected state is the demo's real input. */
function Chip({
  active,
  onClick,
  children,
  tone = "primary",
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  tone?: "primary" | "mahogany";
}) {
  const premium = usePremiumInteractions();
  return (
    <motion.button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      whileTap={{ scale: 0.94 }}
      whileHover={premium ? { y: -1 } : undefined}
      transition={springSnappy}
      className={cn(
        "min-h-[36px] rounded-full border px-3 text-xs font-medium transition-colors",
        active
          ? tone === "mahogany"
            ? "border-mahogany/45 bg-mahogany-soft text-mahogany-strong"
            : "border-primary/45 bg-primary/12 text-primary"
          : "border-border bg-surface-secondary text-muted-foreground",
      )}
    >
      {children}
    </motion.button>
  );
}

/** Meter whose width is driven by live state, not a canned keyframe. */
function Meter({ label, value, tone = "primary" }: { label: string; value: number; tone?: string }) {
  const reduced = useReducedMotionPref();
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <motion.span key={value} className="font-semibold tabular-nums text-foreground">
          {Math.round(value)}%
        </motion.span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-surface-secondary">
        <motion.div
          className={cn("h-full rounded-full", tone)}
          animate={{ width: `${Math.max(2, Math.min(100, value))}%` }}
          transition={reduced ? { duration: 0 } : springSmooth}
        />
      </div>
    </div>
  );
}

/** Big number that counts to its new value whenever state changes. */
function ScoreBadge({ value, label }: { value: number; label: string }) {
  const reduced = useReducedMotionPref();
  const [shown, setShown] = useState(value);

  useEffect(() => {
    if (reduced) {
      setShown(value);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const from = shown;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / 480);
      setShown(Math.round(from + (value - from) * (1 - Math.pow(1 - t, 3))));
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
    // `shown` intentionally excluded: it is the animation's own output.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, reduced]);

  const tone = value >= 80 ? "text-success" : value >= 60 ? "text-primary" : "text-warning";

  return (
    <div className="flex items-center gap-3">
      <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/8">
        <span className={cn("text-2xl font-bold tabular-nums", tone)}>{shown}</span>
      </div>
      <div className="min-w-0">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="text-sm font-medium text-foreground">
          {value >= 80 ? "Interview ready" : value >= 60 ? "Nearly there" : "Needs work"}
        </p>
      </div>
    </div>
  );
}

/* --------------------------- resume intelligence -------------------------- */

const RESUME_SIGNALS = [
  { id: "metrics", label: "Quantified results", weight: 22, fix: "Add numbers: “cut load time 40%”, not “improved performance”." },
  { id: "verbs", label: "Strong action verbs", weight: 16, fix: "Open each bullet with a verb — led, shipped, reduced." },
  { id: "keywords", label: "Role keywords", weight: 24, fix: "Mirror the exact skill words from the job description." },
  { id: "format", label: "ATS-safe layout", weight: 18, fix: "Drop tables and columns; parsers lose text inside them." },
  { id: "summary", label: "Tailored summary", weight: 12, fix: "Three lines naming the role you actually want." },
  { id: "length", label: "Right length", weight: 8, fix: "One page under 10 years' experience, two beyond that." },
];

export function ResumeAnalysisDemo({ className }: { className?: string }) {
  const reduced = useReducedMotionPref();
  const [on, setOn] = useState<string[]>(["verbs", "format"]);
  const [phase, setPhase] = useState<"idle" | "scanning" | "done">("done");
  const timers = useRef<number[]>([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const toggle = (id: string) => {
    setOn((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
    if (reduced) return;
    setPhase("scanning");
    timers.current.forEach(clearTimeout);
    timers.current = [window.setTimeout(() => setPhase("done"), 420)];
  };

  const score = useMemo(
    () => RESUME_SIGNALS.reduce((sum, s) => sum + (on.includes(s.id) ? s.weight : 0), 0),
    [on],
  );
  const missing = RESUME_SIGNALS.filter((s) => !on.includes(s.id));

  const keywords = Math.min(100, on.includes("keywords") ? 88 : 34 + on.length * 4);
  const impact = Math.min(100, on.includes("metrics") ? 84 : 28 + on.length * 5);
  const parse = Math.min(100, on.includes("format") ? 96 : 52);

  return (
    <DemoShell
      eyebrow="Resume Intelligence"
      title="ATS scorecard"
      hint="Toggle what your resume already does — the score, meters and fixes recalculate live."
      className={className}
    >
      <div className="flex flex-wrap gap-2">
        {RESUME_SIGNALS.map((s) => (
          <Chip key={s.id} active={on.includes(s.id)} onClick={() => toggle(s.id)}>
            {on.includes(s.id) && <Check className="mr-1 inline h-3 w-3" aria-hidden="true" />}
            {s.label}
          </Chip>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">
        <ScoreBadge value={score} label="ATS score" />
        <div className="space-y-2.5">
          <Meter label="Keyword coverage" value={keywords} tone="bg-primary" />
          <Meter label="Impact language" value={impact} tone="bg-mahogany" />
          <Meter label="Parse confidence" value={parse} tone="bg-success" />
        </div>
      </div>

      <div className="rounded-xl border border-border/70 bg-surface-secondary/50 p-3">
        <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-foreground">
          {phase === "scanning" ? (
            <>
              <Sparkles className="h-3.5 w-3.5 animate-pulse text-primary" aria-hidden="true" /> Re-scanning…
            </>
          ) : (
            <>
              <Wand2 className="h-3.5 w-3.5 text-primary" aria-hidden="true" /> {missing.length} fixes left
            </>
          )}
        </p>
        <ul className="space-y-1.5" aria-live="polite">
          <AnimatePresence initial={false} mode="popLayout">
            {missing.slice(0, 3).map((s) => (
              <motion.li
                key={s.id}
                layout={!reduced}
                initial={reduced ? { opacity: 0 } : { opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={reduced ? { opacity: 0 } : { opacity: 0, x: 8 }}
                transition={reduced ? { duration: 0.12 } : { duration: duration.fast, ease: easeOut }}
                className="flex gap-2 text-xs text-muted-foreground"
              >
                <FileText className="mt-0.5 h-3 w-3 shrink-0 text-mahogany" aria-hidden="true" />
                <span>{s.fix}</span>
              </motion.li>
            ))}
          </AnimatePresence>
          {missing.length === 0 && (
            <li className="flex items-center gap-2 text-xs text-success">
              <Check className="h-3.5 w-3.5" aria-hidden="true" /> Clean sweep — this resume parses and reads well.
            </li>
          )}
        </ul>
      </div>
    </DemoShell>
  );
}

/* ------------------------------- job matching ----------------------------- */

const DEMO_JOBS = [
  { id: "a", title: "Frontend Engineer", company: "Northwind", location: "Remote", skills: ["react", "ts", "css"], base: 54 },
  { id: "b", title: "Product Engineer", company: "Harbor Labs", location: "Dubai", skills: ["react", "node", "ts"], base: 48 },
  { id: "c", title: "Data Analyst", company: "Meridian", location: "Remote", skills: ["sql", "python"], base: 44 },
  { id: "d", title: "ML Engineer", company: "Cobalt", location: "London", skills: ["python", "sql", "node"], base: 40 },
];

const DEMO_SKILLS = [
  { id: "react", label: "React" },
  { id: "ts", label: "TypeScript" },
  { id: "node", label: "Node" },
  { id: "python", label: "Python" },
  { id: "sql", label: "SQL" },
  { id: "css", label: "CSS" },
];

export function JobMatchDemo({ className }: { className?: string }) {
  const reduced = useReducedMotionPref();
  const [skills, setSkills] = useState<string[]>(["react", "ts"]);
  const [remoteOnly, setRemoteOnly] = useState(false);

  const ranked = useMemo(() => {
    return DEMO_JOBS.map((job) => {
      const hit = job.skills.filter((s) => skills.includes(s)).length;
      const coverage = job.skills.length ? hit / job.skills.length : 0;
      const score = Math.round(Math.min(98, job.base + coverage * 46));
      return { ...job, score, hit, gap: job.skills.filter((s) => !skills.includes(s)) };
    })
      .filter((job) => (remoteOnly ? job.location === "Remote" : true))
      .sort((a, b) => b.score - a.score);
  }, [skills, remoteOnly]);

  return (
    <DemoShell
      eyebrow="Job Matching"
      title="Live match ranking"
      hint="Add a skill and the list re-scores and reorders — exactly how the real matcher ranks openings."
      className={className}
    >
      <div className="flex flex-wrap items-center gap-2">
        {DEMO_SKILLS.map((s) => (
          <Chip key={s.id} active={skills.includes(s.id)} onClick={() => setSkills((p) => (p.includes(s.id) ? p.filter((x) => x !== s.id) : [...p, s.id]))}>
            {skills.includes(s.id) ? <Check className="mr-1 inline h-3 w-3" aria-hidden="true" /> : <Plus className="mr-1 inline h-3 w-3" aria-hidden="true" />}
            {s.label}
          </Chip>
        ))}
        <Chip active={remoteOnly} onClick={() => setRemoteOnly((v) => !v)} tone="mahogany">
          <MapPin className="mr-1 inline h-3 w-3" aria-hidden="true" /> Remote only
        </Chip>
      </div>

      <ul className="space-y-2" aria-live="polite">
        <AnimatePresence initial={false} mode="popLayout">
          {ranked.map((job) => (
            <motion.li
              key={job.id}
              layout={!reduced}
              initial={reduced ? { opacity: 0 } : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.97 }}
              transition={reduced ? { duration: 0.12 } : springSmooth}
              className="flex items-center gap-3 rounded-xl border border-border/70 bg-surface-secondary/45 p-3"
            >
              <div
                className={cn(
                  "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-sm font-bold tabular-nums",
                  job.score >= 80 ? "bg-success/12 text-success" : job.score >= 62 ? "bg-primary/12 text-primary" : "bg-warning/12 text-warning",
                )}
              >
                {job.score}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{job.title}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {job.company} · {job.location}
                </p>
              </div>
              <span className="hidden shrink-0 text-[11px] text-muted-foreground sm:block">
                {job.gap.length === 0 ? "Full skill match" : `${job.gap.length} skill gap${job.gap.length > 1 ? "s" : ""}`}
              </span>
            </motion.li>
          ))}
        </AnimatePresence>
        {ranked.length === 0 && (
          <li className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
            No remote roles in this sample — turn the filter off to see the rest.
          </li>
        )}
      </ul>
    </DemoShell>
  );
}

/* ------------------------------ interview coach --------------------------- */

const STAR_PARTS = [
  { id: "s", label: "Situation", weight: 20, coach: "Set the scene in one line — team, product, stakes." },
  { id: "t", label: "Task", weight: 20, coach: "Say what you specifically owned, not what the team did." },
  { id: "a", label: "Action", weight: 35, coach: "Two or three concrete decisions you made and why." },
  { id: "r", label: "Result", weight: 25, coach: "Land on a number and what changed because of it." },
];

const DEMO_QUESTIONS = [
  "Tell me about a time you shipped under a hard deadline.",
  "Describe a conflict with a teammate and how you resolved it.",
  "Walk me through a decision you got wrong.",
];

export function InterviewCoachDemo({ className }: { className?: string }) {
  const reduced = useReducedMotionPref();
  const [qIndex, setQIndex] = useState(0);
  const [parts, setParts] = useState<string[]>(["s"]);
  const [speaking, setSpeaking] = useState(false);
  const timer = useRef<number>();

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const addPart = (id: string) => {
    setParts((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
    if (reduced) return;
    setSpeaking(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setSpeaking(false), 900);
  };

  const score = STAR_PARTS.reduce((sum, p) => sum + (parts.includes(p.id) ? p.weight : 0), 0);
  const nextTip = STAR_PARTS.find((p) => !parts.includes(p.id));

  return (
    <DemoShell
      eyebrow="Interview Coach"
      title="STAR answer builder"
      hint="Build the answer piece by piece — the coach scores structure the moment you add a beat."
      className={className}
    >
      <div className="flex flex-wrap items-center gap-2">
        {DEMO_QUESTIONS.map((q, i) => (
          <Chip key={q} active={i === qIndex} onClick={() => { setQIndex(i); setParts(["s"]); }} tone="mahogany">
            Question {i + 1}
          </Chip>
        ))}
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-border/70 bg-surface-secondary/45 p-3">
        <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/12 text-primary">
          <Mic className="h-4 w-4" aria-hidden="true" />
          {speaking && !reduced && (
            <motion.span
              className="absolute inset-0 rounded-full border border-primary/50"
              animate={{ scale: [1, 1.45], opacity: [0.7, 0] }}
              transition={{ duration: 1, repeat: Infinity }}
            />
          )}
        </div>
        <p className="text-sm text-foreground">{DEMO_QUESTIONS[qIndex]}</p>
      </div>

      <div className="grid gap-2 sm:grid-cols-4">
        {STAR_PARTS.map((p) => {
          const active = parts.includes(p.id);
          return (
            <motion.button
              key={p.id}
              type="button"
              onClick={() => addPart(p.id)}
              aria-pressed={active}
              whileTap={{ scale: 0.96 }}
              transition={springSnappy}
              className={cn(
                "min-h-[44px] rounded-xl border px-3 py-2 text-left text-xs transition-colors",
                active ? "border-primary/45 bg-primary/10 text-primary" : "border-border bg-surface-secondary text-muted-foreground",
              )}
            >
              <span className="block font-semibold">{p.label}</span>
              <span className="block text-[11px] opacity-80">{active ? "added" : "tap to add"}</span>
            </motion.button>
          );
        })}
      </div>

      <div className="grid gap-4 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">
        <ScoreBadge value={score} label="Structure" />
        <motion.p
          key={nextTip?.id ?? "done"}
          initial={reduced ? { opacity: 0 } : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduced ? 0.12 : duration.fast, ease: easeOut }}
          className="rounded-xl border border-mahogany/25 bg-mahogany-soft/60 p-3 text-xs text-mahogany-strong"
        >
          {nextTip ? nextTip.coach : "Complete STAR answer — now tighten it to 90 seconds and lead with the result."}
        </motion.p>
      </div>
    </DemoShell>
  );
}

/* ---------------------------- career roadmap ------------------------------ */

const ROLES = {
  frontend: {
    label: "Senior Frontend",
    steps: [
      { id: 1, title: "Ship a measurable perf win", weeks: 2, icon: Gauge },
      { id: 2, title: "Own a design-system surface", weeks: 4, icon: Layers },
      { id: 3, title: "Lead a cross-team feature", weeks: 8, icon: Rocket },
      { id: 4, title: "Mentor + write the RFC", weeks: 12, icon: Award },
    ],
  },
  data: {
    label: "Data Scientist",
    steps: [
      { id: 1, title: "Publish an end-to-end analysis", weeks: 2, icon: Braces },
      { id: 2, title: "Productionise one model", weeks: 5, icon: Layers },
      { id: 3, title: "Own a business metric", weeks: 9, icon: TrendingUp },
      { id: 4, title: "Present to leadership", weeks: 12, icon: Award },
    ],
  },
  pm: {
    label: "Product Manager",
    steps: [
      { id: 1, title: "Run 10 user interviews", weeks: 2, icon: Target },
      { id: 2, title: "Write a shipped spec", weeks: 5, icon: FileText },
      { id: 3, title: "Own a quarterly goal", weeks: 9, icon: TrendingUp },
      { id: 4, title: "Drive a launch", weeks: 12, icon: Rocket },
    ],
  },
} as const;

type RoleKey = keyof typeof ROLES;

export function CareerRoadmapDemo({ className }: { className?: string }) {
  const reduced = useReducedMotionPref();
  const [role, setRole] = useState<RoleKey>("frontend");
  const [done, setDone] = useState<number[]>([1]);

  const steps = ROLES[role].steps;
  const progress = Math.round((done.length / steps.length) * 100);
  const weeksLeft = steps.filter((s) => !done.includes(s.id)).reduce((n, s) => Math.max(n, s.weeks), 0);

  return (
    <DemoShell
      eyebrow="Career Intelligence"
      title="Roadmap to your next role"
      hint="Pick a target and tick milestones — progress, timeline and the next move update instantly."
      className={className}
    >
      <div className="flex flex-wrap gap-2">
        {(Object.keys(ROLES) as RoleKey[]).map((key) => (
          <Chip key={key} active={role === key} onClick={() => { setRole(key); setDone([1]); }}>
            {ROLES[key].label}
          </Chip>
        ))}
      </div>

      <div className="flex items-center gap-4">
        <ScoreBadge value={progress} label="Roadmap" />
        <div className="min-w-0 flex-1 space-y-2">
          <Meter label="Milestones complete" value={progress} tone="bg-primary" />
          <p className="text-xs text-muted-foreground">
            {weeksLeft === 0 ? "Ready to apply for this level today." : `About ${weeksLeft} weeks of focused work left.`}
          </p>
        </div>
      </div>

      <ol className="relative space-y-2 border-l border-border/70 pl-4">
        {steps.map((step) => {
          const complete = done.includes(step.id);
          const Icon = step.icon;
          return (
            <li key={`${role}-${step.id}`}>
              <motion.button
                type="button"
                onClick={() => setDone((p) => (p.includes(step.id) ? p.filter((x) => x !== step.id) : [...p, step.id]))}
                aria-pressed={complete}
                whileTap={{ scale: 0.985 }}
                initial={reduced ? { opacity: 0 } : { opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={reduced ? { duration: 0.12 } : { ...springSmooth, delay: step.id * 0.04 }}
                className={cn(
                  "flex min-h-[52px] w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition-colors",
                  complete ? "border-success/35 bg-success/8" : "border-border bg-surface-secondary/50",
                )}
              >
                <span
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                    complete ? "bg-success/15 text-success" : "bg-primary/10 text-primary",
                  )}
                >
                  {complete ? <Check className="h-4 w-4" aria-hidden="true" /> : <Icon className="h-4 w-4" aria-hidden="true" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cn("block truncate text-sm", complete ? "text-muted-foreground line-through" : "text-foreground")}>
                    {step.title}
                  </span>
                  <span className="block text-[11px] text-muted-foreground">Week {step.weeks}</span>
                </span>
              </motion.button>
            </li>
          );
        })}
      </ol>
    </DemoShell>
  );
}

/* ------------------------------- collection ------------------------------- */

export const engineDemos = {
  resume: ResumeAnalysisDemo,
  match: JobMatchDemo,
  interview: InterviewCoachDemo,
  career: CareerRoadmapDemo,
} as const;

/** All four demos in a responsive grid — used on the landing page. */
export function InteractiveDemoGrid({ className }: { className?: string }) {
  return (
    <div className={cn("grid gap-4 lg:grid-cols-2", className)}>
      <ResumeAnalysisDemo />
      <JobMatchDemo />
      <InterviewCoachDemo />
      <CareerRoadmapDemo />
    </div>
  );
}
