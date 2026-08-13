import { ChevronDown, Gauge } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useState } from "react";
import { useNavigate } from "@/lib/router-compat";
import type { Briefing } from "@/lib/careerBriefing";

/**
 * "Why this score" — an audit trail for the Career Readiness dial.
 * Every component shows its weight, its formula, and the exact data signals
 * that produced the number, so the score is never a black box.
 */
export function WhyThisScore({ briefing }: { briefing: Briefing }) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const navigate = useNavigate();
  const reduce = useReducedMotion();

  return (
    <section aria-labelledby="why-score-heading" className="glass-card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="why-score-body"
        className="flex w-full items-center justify-between gap-3 p-5 text-left transition-colors hover:bg-secondary/30"
      >
        <span className="flex items-center gap-2">
          <Gauge className="h-4 w-4 text-primary" aria-hidden />
          <span>
            <span id="why-score-heading" className="block text-sm font-semibold text-foreground">
              Why your readiness is {briefing.readiness}
            </span>
            <span className="block text-xs text-muted-foreground">
              Four weighted components, calculated from your own data
            </span>
          </span>
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id="why-score-body"
            initial={reduce ? false : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={reduce ? undefined : { height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="space-y-3 border-t border-border/60 p-5">
              {briefing.breakdown.map((component) => {
                const isOpen = expanded === component.key;
                const contribution = Math.round(component.value * component.weight);
                return (
                  <div key={component.key} className="rounded-xl border border-border/60 bg-secondary/30 p-4">
                    <button
                      type="button"
                      onClick={() => setExpanded(isOpen ? null : component.key)}
                      aria-expanded={isOpen}
                      className="flex w-full items-center justify-between gap-3 text-left"
                    >
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-foreground">{component.label}</span>
                        <span className="block text-xs text-muted-foreground">
                          {component.value}/100 × {Math.round(component.weight * 100)}% weight ={" "}
                          <span className="tabular-nums text-foreground">{contribution} pts</span>
                        </span>
                      </span>
                      <ChevronDown
                        className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`}
                        aria-hidden
                      />
                    </button>

                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-background/60">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${component.value}%` }} />
                    </div>

                    <AnimatePresence initial={false}>
                      {isOpen && (
                        <motion.div
                          initial={reduce ? false : { height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={reduce ? undefined : { height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <p className="mt-3 text-xs text-muted-foreground">{component.formula}</p>
                          <dl className="mt-3 grid gap-2 sm:grid-cols-2">
                            {component.signals.map((s) => (
                              <div
                                key={s.label}
                                className="flex items-baseline justify-between gap-3 rounded-lg bg-background/50 px-3 py-2"
                              >
                                <dt className="text-xs text-muted-foreground">{s.label}</dt>
                                <dd className="text-xs font-medium tabular-nums text-foreground">{s.value}</dd>
                              </div>
                            ))}
                          </dl>
                          <button
                            type="button"
                            onClick={() => navigate(component.lever.to)}
                            className="mt-3 text-xs text-primary hover:underline"
                          >
                            {component.lever.label} →
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}

              <p className="text-xs text-muted-foreground">
                Readiness = the sum of every component's weighted contribution, rounded to the nearest point.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
