import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from "motion/react";
import { useRef } from "react";
import { Activity, Bot, Check, FileText, Mic, Sparkles, Target } from "lucide-react";
import { CountUp } from "@/components/motion";
import { springPointer, springSoft, easeOut } from "@/lib/motion/tokens";

/* --------------------------- small building blocks -------------------------- */

function Bar({ label, value, delay }: { label: string; value: number; delay: number }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span>{label}</span>
        <span className="tabular-nums text-foreground/80">{value}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-primary to-primary-glow"
          initial={{ scaleX: 0 }}
          animate={{ scaleX: value / 100 }}
          style={{ transformOrigin: "left" }}
          transition={{ duration: 1.1, ease: easeOut, delay }}
        />
      </div>
    </div>
  );
}

function Waveform() {
  const reduced = useReducedMotion();
  const bars = Array.from({ length: 22 });
  return (
    <div className="flex h-8 items-center gap-[3px]" aria-hidden>
      {bars.map((_, i) => (
        <motion.span
          key={i}
          className="w-[3px] rounded-full bg-primary/70"
          initial={{ height: 6 }}
          animate={reduced ? { height: 12 } : { height: [6, 8 + ((i * 7) % 22), 6] }}
          transition={{
            duration: 1.1 + (i % 5) * 0.12,
            repeat: reduced ? 0 : Infinity,
            ease: "easeInOut",
            delay: i * 0.045,
          }}
        />
      ))}
    </div>
  );
}

/* --------------------------------- panels --------------------------------- */

const cardBase =
  "glass-panel rounded-2xl p-4 will-change-transform";

function ScorePanel() {
  return (
    <div className={`${cardBase} w-full`}>
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
          <FileText className="h-3.5 w-3.5 text-primary" aria-hidden />
          Resume Intelligence
        </span>
        <span className="rounded-full bg-success-soft px-2 py-0.5 text-[10px] font-semibold text-success">
          Parsed
        </span>
      </div>

      <div className="mt-4 flex items-end gap-3">
        <span className="type-hero !text-5xl leading-none text-foreground">
          <CountUp to={92} duration={1.8} immediate />
        </span>
        <span className="pb-2 text-xs text-muted-foreground">ATS score</span>
      </div>

      <div className="mt-4 space-y-3">
        <Bar label="Keyword coverage" value={88} delay={0.5} />
        <Bar label="Impact language" value={76} delay={0.65} />
        <Bar label="Structure" value={95} delay={0.8} />
      </div>
    </div>
  );
}

const MATCHES = [
  { role: "Product Analyst", company: "Northwind", score: 94 },
  { role: "Data Associate", company: "Helio Labs", score: 88 },
  { role: "Strategy Intern", company: "Meridian", score: 81 },
];

function MatchPanel() {
  return (
    <div className={`${cardBase} w-full`}>
      <span className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
        <Target className="h-3.5 w-3.5 text-primary" aria-hidden />
        Live job matches
      </span>
      <ul className="mt-3 space-y-2">
        {MATCHES.map((m, i) => (
          <motion.li
            key={m.role}
            initial={{ opacity: 0, x: 14 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ ...springSoft, delay: 0.8 + i * 0.14 }}
            className="flex items-center justify-between rounded-xl border border-border/70 bg-surface/60 px-3 py-2"
          >
            <span className="min-w-0">
              <span className="block truncate text-xs font-medium text-foreground">{m.role}</span>
              <span className="block truncate text-[10px] text-muted-foreground">{m.company}</span>
            </span>
            <span className="ml-3 shrink-0 text-xs font-semibold tabular-nums text-primary">
              <CountUp to={m.score} duration={1.2} suffix="%" immediate />
            </span>
          </motion.li>
        ))}
      </ul>
    </div>
  );
}

function InterviewPanel() {
  return (
    <div className={`${cardBase} w-full`}>
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
          <Mic className="h-3.5 w-3.5 text-brand-secondary" aria-hidden />
          AI mock interview
        </span>
        <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <motion.span
            className="h-1.5 w-1.5 rounded-full bg-destructive"
            animate={{ opacity: [1, 0.25, 1] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
            aria-hidden
          />
          Live
        </span>
      </div>
      <Waveform />
      <motion.p
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.2, duration: 0.6, ease: easeOut }}
        className="text-[11px] leading-relaxed text-muted-foreground"
      >
        <span className="text-foreground/80">Interviewer:</span> Walk me through a project where
        you changed the outcome with data.
      </motion.p>
    </div>
  );
}

function InsightChip() {
  return (
    <motion.div
      className="glass-panel flex items-center gap-2 rounded-full px-3 py-2"
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ ...springSoft, delay: 1.1 }}
    >
      <Sparkles className="h-3.5 w-3.5 text-brand-secondary" aria-hidden />
      <span className="text-[11px] font-medium text-foreground">
        3 skills away from Senior Analyst
      </span>
    </motion.div>
  );
}

/* ------------------------------- composition ------------------------------- */

/**
 * The hero product visualization: a stack of live Gradr surfaces floating in
 * depth. The whole composition tilts toward the pointer, and each layer moves
 * at a different rate so it reads as a real 3D command center.
 */
export function HeroCommandCenter() {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const mx = useSpring(useMotionValue(0), springPointer);
  const my = useSpring(useMotionValue(0), springPointer);

  const rotateY = useTransform(mx, [-1, 1], [8, -8]);
  const rotateX = useTransform(my, [-1, 1], [-6, 6]);
  const layer = (depth: number) => ({
    x: useTransform(mx, [-1, 1], [-depth, depth]),
    y: useTransform(my, [-1, 1], [-depth * 0.6, depth * 0.6]),
  });

  const near = layer(18);
  const mid = layer(10);
  const far = layer(4);

  return (
    <div
      ref={ref}
      className="relative mx-auto w-full max-w-[560px]"
      onPointerMove={(e) => {
        if (reduced || e.pointerType !== "mouse") return;
        const rect = ref.current?.getBoundingClientRect();
        if (!rect) return;
        mx.set(((e.clientX - rect.left) / rect.width - 0.5) * 2);
        my.set(((e.clientY - rect.top) / rect.height - 0.5) * 2);
      }}
      onPointerLeave={() => {
        mx.set(0);
        my.set(0);
      }}
    >
      {/* atmospheric bloom behind the stack */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute -inset-10 -z-10 rounded-[3rem] bg-primary/12 blur-[80px]"
        animate={reduced ? undefined : { opacity: [0.55, 0.9, 0.55], scale: [0.98, 1.02, 0.98] }}
        transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
      />

      <motion.div
        style={reduced ? undefined : { rotateX, rotateY, transformStyle: "preserve-3d" }}
        className="relative"
      >
        {/* main frame */}
        <motion.div
          initial={{ opacity: 0, y: 26, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ ...springSoft, delay: 0.15 }}
          style={reduced ? undefined : far}
          className="overflow-hidden rounded-[1.75rem] border border-border/80 bg-card/80 p-4 shadow-[var(--shadow-elevated)] backdrop-blur-xl"
        >
          <div className="flex items-center justify-between border-b border-border/60 pb-3">
            <span className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.18em] text-muted-foreground">
              <Bot className="h-3.5 w-3.5 text-primary" aria-hidden />
              CAREER COMMAND CENTER
            </span>
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Activity className="h-3 w-3 text-success" aria-hidden />
              synced
            </span>
          </div>

          <div className="mt-4 grid gap-3">
            <ScorePanel />
            <InterviewPanel />
          </div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.5, duration: 0.6 }}
            className="mt-3 flex items-center gap-2 rounded-xl border border-primary/25 bg-primary/[0.07] px-3 py-2"
          >
            <Check className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
            <span className="text-[11px] text-foreground/85">
              Applied to 4 matched roles this week — 2 moved to interview.
            </span>
          </motion.div>
        </motion.div>

        {/* floating match panel */}
        <motion.div
          className="absolute -right-4 top-16 hidden w-[248px] sm:block lg:-right-12"
          initial={{ opacity: 0, x: 30, y: 10 }}
          animate={{ opacity: 1, x: 0, y: 0 }}
          transition={{ ...springSoft, delay: 0.45 }}
          style={reduced ? undefined : near}
        >
          <motion.div
            animate={reduced ? undefined : { y: [0, -8, 0] }}
            transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
          >
            <MatchPanel />
          </motion.div>
        </motion.div>

        {/* floating insight chip */}
        <motion.div
          className="absolute -left-3 bottom-10 hidden sm:block lg:-left-10"
          style={reduced ? undefined : mid}
        >
          <motion.div
            animate={reduced ? undefined : { y: [0, 9, 0] }}
            transition={{ duration: 8.5, repeat: Infinity, ease: "easeInOut" }}
          >
            <InsightChip />
          </motion.div>
        </motion.div>
      </motion.div>
    </div>
  );
}

export default HeroCommandCenter;
