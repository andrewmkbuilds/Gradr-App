/**
 * Animated landing product demos.
 *
 * Each demo is a self-running, in-viewport animation of a real Gradr surface:
 * Resume Intelligence, Job Matching, Interview Coach, Career Intelligence.
 *
 * Rules they all follow:
 *  - timing/easing comes from `src/lib/motion/tokens.ts` — nothing hand-tuned
 *  - every animation stops at a readable static state when motion is reduced
 *  - parallax is a single transform channel, disabled when reduced
 */
import { useEffect, useRef, useState } from "react";
import { motion, useInView, useScroll, useSpring, useTransform } from "motion/react";
import {
  ArrowUpRight, Bot, Check, FileText, LineChart, MapPin, Mic, Sparkles, Target, TrendingUp,
} from "lucide-react";
import { CountUp } from "@/components/motion/CountUp";
import { AppFrame, FloatingReadout } from "@/components/landing/visuals";
import { useReducedMotionPref } from "@/hooks/useMotionPreference";
import { useStagger } from "@/hooks/useMotionVariants";
import { duration, easeOut, listItem, springSmooth, viewportOnce } from "@/lib/motion/tokens";
import { cn } from "@/lib/utils";

/* ------------------------------- primitives ------------------------------ */

/** Single-channel scroll parallax wrapper. */
function ParallaxLayer({
  children,
  distance = 40,
  className,
}: {
  children: React.ReactNode;
  distance?: number;
  className?: string;
}) {
  const reduced = useReducedMotionPref();
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const y = useSpring(useTransform(scrollYProgress, [0, 1], [distance / 2, -distance / 2]), {
    stiffness: 110,
    damping: 28,
    mass: 0.6,
  });
  return (
    <div ref={ref} className={className}>
      <motion.div style={reduced ? undefined : { y }}>{children}</motion.div>
    </div>
  );
}

/** Progress bar that fills once, in view, from the shared easing curve. */
function AnimatedMeter({
  label,
  value,
  tone = "primary",
  delay = 0,
}: {
  label: string;
  value: number;
  tone?: "primary" | "accent" | "success" | "warning";
  delay?: number;
}) {
  const reduced = useReducedMotionPref();
  const bar =
    tone === "success" ? "bg-success"
      : tone === "warning" ? "bg-warning"
      : tone === "accent" ? "bg-accent"
      : "bg-primary";

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="truncate type-caption text-muted-foreground">{label}</span>
        <span className="type-caption font-semibold tabular-nums text-foreground">
          <CountUp to={value} duration={1.1} />
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
        <motion.div
          className={cn("h-full rounded-full", bar)}
          initial={{ width: reduced ? `${value}%` : "0%" }}
          whileInView={{ width: `${value}%` }}
          viewport={viewportOnce}
          transition={reduced ? { duration: 0 } : { duration: 1.1, ease: easeOut, delay }}
        />
      </div>
    </div>
  );
}

/** Steps through an index on a fixed interval; freezes on the last step when reduced. */
function useCycle(length: number, ms = 2200) {
  const reduced = useReducedMotionPref();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.35 });
  const [index, setIndex] = useState(reduced ? length - 1 : 0);

  useEffect(() => {
    if (reduced || !inView) return;
    const id = window.setInterval(() => setIndex((i) => (i + 1) % length), ms);
    return () => window.clearInterval(id);
  }, [reduced, inView, length, ms]);

  return { ref, index };
}

/* ------------------------- 01 · Resume Intelligence ---------------------- */

const RESUME_LINES = [
  { text: "Responsible for managing the reporting process", fixed: "Cut reporting cycle from 5 days to 8 hours", tone: "warning" as const },
  { text: "Helped the team with onboarding tasks", fixed: "Onboarded 24 hires; ramp time down 31%", tone: "warning" as const },
  { text: "Worked on the analytics dashboard", fixed: "Shipped analytics dashboard used by 400 staff", tone: "warning" as const },
];

export function ResumeIntelligenceDemo() {
  const { ref, index } = useCycle(RESUME_LINES.length, 2600);
  const reduced = useReducedMotionPref();
  const container = useStagger(0.08, 0.1);

  return (
    <ParallaxLayer distance={44}>
      <div ref={ref}>
        <AppFrame
          title="gradr — resume intelligence"
          overlay={
            <FloatingReadout className="-right-6 top-8" delay={0.2}>
              <p className="type-overline text-muted-foreground">ATS score</p>
              <p className="type-metric-sm text-primary">
                <CountUp to={92} duration={1.6} />
              </p>
            </FloatingReadout>
          }
        >
          <motion.div variants={container} initial="hidden" whileInView="show" viewport={viewportOnce} className="space-y-4">
            <motion.div variants={listItem} className="flex items-center gap-2.5">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary/12 text-primary">
                <FileText className="h-4 w-4" aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="type-h4 truncate">senior-pm-resume.pdf</p>
                <p className="type-caption text-muted-foreground">Parsed · 2 pages · 641 words</p>
              </div>
            </motion.div>

            <motion.div variants={listItem} className="grid gap-2.5 sm:grid-cols-2">
              <AnimatedMeter label="ATS compatibility" value={92} tone="success" />
              <AnimatedMeter label="Keyword coverage" value={78} delay={0.1} />
              <AnimatedMeter label="Impact language" value={64} tone="warning" delay={0.2} />
              <AnimatedMeter label="Structure" value={88} tone="accent" delay={0.3} />
            </motion.div>

            <motion.div variants={listItem} className="space-y-2 rounded-xl border border-border bg-secondary/30 p-3">
              <p className="type-overline text-muted-foreground">Rewrites suggested</p>
              {RESUME_LINES.map((line, i) => {
                const active = i === index;
                return (
                  <div key={line.text} className="space-y-1">
                    <p className={cn("type-caption line-through", active ? "text-muted-foreground/70" : "text-muted-foreground/40")}>
                      {line.text}
                    </p>
                    <motion.p
                      className="flex items-start gap-1.5 type-caption font-medium text-foreground"
                      initial={false}
                      animate={
                        reduced
                          ? { opacity: 1 }
                          : { opacity: active ? 1 : 0.35, x: active ? 0 : -4 }
                      }
                      transition={{ duration: duration.base, ease: easeOut }}
                    >
                      <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-accent" aria-hidden />
                      {line.fixed}
                    </motion.p>
                  </div>
                );
              })}
            </motion.div>
          </motion.div>
        </AppFrame>
      </div>
    </ParallaxLayer>
  );
}

/* ----------------------------- 02 · Job Matching -------------------------- */

const MATCHES = [
  { role: "Senior Product Manager", company: "Northwind", place: "London · Hybrid", score: 94, skills: ["Roadmapping", "SQL", "Discovery"], missing: "Pricing" },
  { role: "Product Lead, Growth", company: "Halyard", place: "Remote · UK", score: 87, skills: ["Experimentation", "Analytics"], missing: "B2C scale" },
  { role: "Principal PM, Platform", company: "Marlowe", place: "Dublin · Onsite", score: 71, skills: ["APIs", "Stakeholders"], missing: "Infra depth" },
];

export function JobMatchingDemo() {
  const { ref, index } = useCycle(MATCHES.length, 2400);
  const container = useStagger(0.07, 0.05);

  return (
    <ParallaxLayer distance={40}>
      <div ref={ref}>
        <AppFrame
          title="gradr — job matching"
          overlay={
            <FloatingReadout className="-left-8 -bottom-7" z={60} delay={0.35}>
              <p className="type-overline text-muted-foreground">Live roles scored</p>
              <p className="type-metric-sm text-accent">
                <CountUp to={1284} duration={1.8} />
              </p>
            </FloatingReadout>
          }
        >
          <motion.div variants={container} initial="hidden" whileInView="show" viewport={viewportOnce} className="space-y-3">
            <motion.div variants={listItem} className="flex items-center gap-2.5">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent/12 text-accent">
                <Target className="h-4 w-4" aria-hidden />
              </span>
              <p className="type-h4">Ranked against your resume</p>
            </motion.div>

            {MATCHES.map((m, i) => {
              const active = i === index;
              return (
                <motion.div
                  key={m.role}
                  variants={listItem}
                  animate={{ scale: active ? 1 : 0.995 }}
                  transition={springSmooth}
                  className={cn(
                    "rounded-xl border p-3 transition-colors",
                    active ? "border-primary/50 bg-primary/[0.06]" : "border-border bg-secondary/25",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="type-h4 truncate">{m.role}</p>
                      <p className="flex items-center gap-1 type-caption text-muted-foreground">
                        <MapPin className="h-3 w-3" aria-hidden />
                        {m.company} · {m.place}
                      </p>
                    </div>
                    <span className={cn("type-metric-sm shrink-0", active ? "text-primary" : "text-muted-foreground")}>
                      {active ? <CountUp to={m.score} duration={0.9} immediate /> : m.score}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {m.skills.map((s) => (
                      <span key={s} className="inline-flex items-center gap-1 rounded-full bg-success/12 px-2 py-0.5 type-caption text-success">
                        <Check className="h-3 w-3" aria-hidden />
                        {s}
                      </span>
                    ))}
                    <span className="rounded-full bg-warning/12 px-2 py-0.5 type-caption text-warning">
                      Missing · {m.missing}
                    </span>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        </AppFrame>
      </div>
    </ParallaxLayer>
  );
}

/* ---------------------------- 03 · Interview Coach ------------------------ */

const TURNS = [
  { who: "Interviewer", line: "Walk me through a launch that missed its target." },
  { who: "You", line: "Our billing revamp slipped a quarter — I owned the scope call." },
  { who: "Interviewer", line: "What signal told you to cut scope, and when?" },
];

function VoiceBars({ active }: { active: boolean }) {
  const reduced = useReducedMotionPref();
  const heights = [10, 20, 32, 22, 14, 26, 12];
  return (
    <div className="flex h-8 items-end gap-1" aria-hidden>
      {heights.map((h, i) => (
        <motion.span
          key={i}
          className="w-1 rounded-full bg-primary"
          style={{ height: h }}
          animate={reduced || !active ? { scaleY: 0.6 } : { scaleY: [0.4, 1, 0.55, 0.9, 0.45] }}
          transition={reduced ? { duration: 0 } : { duration: 1.6, repeat: Infinity, delay: i * 0.09, ease: "easeInOut" }}
        />
      ))}
    </div>
  );
}

export function InterviewCoachDemo() {
  const { ref, index } = useCycle(TURNS.length, 2800);
  const speaking = TURNS[index].who === "Interviewer";

  return (
    <ParallaxLayer distance={52}>
      <div ref={ref}>
        <AppFrame
          title="gradr — interview studio"
          overlay={
            <FloatingReadout className="right-4 -bottom-8" z={65} delay={0.25}>
              <p className="type-overline text-muted-foreground">Live coaching</p>
              <p className="type-caption font-medium text-foreground">Add a metric to that answer</p>
            </FloatingReadout>
          }
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary/12 text-primary">
                  <Bot className="h-4 w-4" aria-hidden />
                </span>
                <div>
                  <p className="type-h4">Senior PM · Behavioural</p>
                  <p className="type-caption text-muted-foreground">Round 2 · 18 min</p>
                </div>
              </div>
              <VoiceBars active={speaking} />
            </div>

            <div className="space-y-2">
              {TURNS.map((turn, i) => (
                <motion.div
                  key={turn.line}
                  initial={false}
                  animate={{ opacity: i <= index ? 1 : 0.25, y: i <= index ? 0 : 6 }}
                  transition={{ duration: duration.base, ease: easeOut }}
                  className={cn(
                    "rounded-xl px-3 py-2",
                    turn.who === "You" ? "ml-8 bg-accent/10 text-foreground" : "mr-8 bg-secondary/40",
                  )}
                >
                  <p className="type-overline text-muted-foreground">{turn.who}</p>
                  <p className="type-caption text-foreground">{turn.line}</p>
                </motion.div>
              ))}
            </div>

            <div className="grid gap-2.5 rounded-xl border border-border bg-secondary/25 p-3 sm:grid-cols-3">
              <AnimatedMeter label="Structure" value={84} />
              <AnimatedMeter label="Specificity" value={71} tone="warning" delay={0.1} />
              <AnimatedMeter label="Clarity" value={90} tone="success" delay={0.2} />
            </div>

            <p className="flex items-center gap-1.5 type-caption text-muted-foreground">
              <Mic className="h-3 w-3 text-primary" aria-hidden />
              Speak naturally — interrupt any time, the interviewer adapts.
            </p>
          </div>
        </AppFrame>
      </div>
    </ParallaxLayer>
  );
}

/* -------------------------- 04 · Career Intelligence ---------------------- */

const TREND = [38, 44, 41, 55, 62, 68, 74, 81];

export function CareerIntelligenceDemo() {
  const reduced = useReducedMotionPref();
  const container = useStagger(0.07, 0.05);
  const points = TREND.map((v, i) => `${(i / (TREND.length - 1)) * 100},${100 - v}`).join(" ");

  return (
    <ParallaxLayer distance={36}>
      <AppFrame
        title="gradr — career intelligence"
        overlay={
          <FloatingReadout className="-left-6 top-10" z={62} delay={0.15}>
            <p className="type-overline text-muted-foreground">Readiness</p>
            <p className="type-metric-sm text-primary">
              <CountUp to={81} duration={1.5} suffix="%" />
            </p>
          </FloatingReadout>
        }
      >
        <motion.div variants={container} initial="hidden" whileInView="show" viewport={viewportOnce} className="space-y-4">
          <motion.div variants={listItem} className="grid grid-cols-3 gap-2.5">
            {[
              { label: "Applications", value: 46, icon: ArrowUpRight },
              { label: "Interviews", value: 9, icon: Mic },
              { label: "Offers", value: 2, icon: TrendingUp },
            ].map((s) => (
              <div key={s.label} className="rounded-xl border border-border bg-secondary/25 p-3">
                <s.icon className="h-3.5 w-3.5 text-primary" aria-hidden />
                <p className="mt-1.5 type-metric-sm">
                  <CountUp to={s.value} duration={1.3} />
                </p>
                <p className="type-caption text-muted-foreground">{s.label}</p>
              </div>
            ))}
          </motion.div>

          <motion.div variants={listItem} className="rounded-xl border border-border bg-secondary/25 p-3">
            <div className="flex items-center justify-between">
              <p className="type-overline text-muted-foreground">Readiness trend</p>
              <span className="flex items-center gap-1 type-caption text-success">
                <TrendingUp className="h-3 w-3" aria-hidden />
                +43 pts
              </span>
            </div>
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="mt-2 h-24 w-full" aria-hidden>
              <motion.polyline
                points={points}
                fill="none"
                stroke="hsl(var(--primary))"
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
                initial={{ pathLength: reduced ? 1 : 0 }}
                whileInView={{ pathLength: 1 }}
                viewport={viewportOnce}
                transition={reduced ? { duration: 0 } : { duration: 1.6, ease: easeOut }}
              />
            </svg>
          </motion.div>

          <motion.div variants={listItem} className="grid gap-2.5 sm:grid-cols-2">
            <AnimatedMeter label="Resume health" value={92} tone="success" />
            <AnimatedMeter label="Pipeline momentum" value={68} delay={0.1} />
            <AnimatedMeter label="Interview performance" value={74} tone="accent" delay={0.2} />
            <AnimatedMeter label="Skill coverage" value={59} tone="warning" delay={0.3} />
          </motion.div>

          <motion.p variants={listItem} className="flex items-center gap-1.5 type-caption text-muted-foreground">
            <LineChart className="h-3 w-3 text-accent" aria-hidden />
            Next best action: practise pricing questions before Thursday.
          </motion.p>
        </motion.div>
      </AppFrame>
    </ParallaxLayer>
  );
}
