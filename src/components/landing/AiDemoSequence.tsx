import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Bot, Check, FileText, Mic, Send, Target } from "lucide-react";
import { ease, spring } from "@/lib/motion";

/**
 * Looping "AI at work" sequence for the landing hero.
 * Each step types a line, shows a result chip, then hands off to the next
 * module — demonstrating the connected loop without any real backend calls.
 * Under reduced motion the full list renders statically.
 */
const STEPS = [
  { icon: FileText, label: "Resume Intelligence", line: "Parsing resume · scoring ATS compatibility", result: "ATS 86 · +12" },
  { icon: Target, label: "Job Matching", line: "Ranking 214 live roles against your skills", result: "3 strong fits" },
  { icon: Send, label: "Application Studio", line: "Drafting a tailored cover letter + outreach", result: "Package ready" },
  { icon: Mic, label: "Mock Interview", line: "Running a spoken system-design round", result: "Readiness 7.8" },
];

export function AiDemoSequence() {
  const reduce = useReducedMotion();
  const [i, setI] = useState(0);

  useEffect(() => {
    if (reduce) return;
    const t = setInterval(() => setI((v) => (v + 1) % STEPS.length), 3200);
    return () => clearInterval(t);
  }, [reduce]);

  if (reduce) {
    return (
      <ul className="rounded-2xl border border-border bg-card/60 p-4 space-y-2">
        {STEPS.map((s) => (
          <li key={s.label} className="flex items-center gap-2 text-xs text-muted-foreground">
            <s.icon className="h-3.5 w-3.5 text-primary" aria-hidden />
            <span className="text-foreground">{s.label}</span> — {s.line}
          </li>
        ))}
      </ul>
    );
  }

  const step = STEPS[i]!;
  const Icon = step.icon;

  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-border bg-card/70 p-4 backdrop-blur-xl"
      aria-live="polite"
    >
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
        <Bot className="h-3.5 w-3.5 text-primary" aria-hidden />
        Gradr AI · live loop
      </div>

      <div className="relative mt-3 h-14">
        <AnimatePresence mode="wait">
          <motion.div
            key={step.label}
            initial={{ opacity: 0, y: 14, filter: "blur(6px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -14, filter: "blur(6px)" }}
            transition={{ duration: 0.4, ease: ease.entrance }}
            className="absolute inset-0"
          >
            <div className="flex items-center gap-2">
              <Icon className="h-4 w-4 text-primary" aria-hidden />
              <span className="text-sm font-semibold text-foreground">{step.label}</span>
              <motion.span
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ ...spring.snappy, delay: 0.9 }}
                className="ml-auto inline-flex items-center gap-1 rounded-md bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary"
              >
                <Check className="h-3 w-3" aria-hidden />
                {step.result}
              </motion.span>
            </div>
            <motion.p
              initial={{ clipPath: "inset(0 100% 0 0)" }}
              animate={{ clipPath: "inset(0 0% 0 0)" }}
              transition={{ duration: 0.9, ease: ease.inOut }}
              className="mt-1.5 whitespace-nowrap text-xs text-muted-foreground"
            >
              {step.line}
            </motion.p>
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="mt-1 flex gap-1.5" aria-hidden>
        {STEPS.map((s, idx) => (
          <div key={s.label} className="h-0.5 flex-1 overflow-hidden rounded-full bg-border">
            <motion.div
              className="h-full bg-primary"
              initial={false}
              animate={{ width: idx === i ? "100%" : idx < i ? "100%" : "0%" }}
              transition={{ duration: idx === i ? 3.1 : 0.3, ease: "linear" }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export default AiDemoSequence;
