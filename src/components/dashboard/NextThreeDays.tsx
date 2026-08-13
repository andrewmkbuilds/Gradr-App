import { CalendarRange, Check, Loader2, RefreshCw, Sparkles, ArrowRight } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useNavigate } from "@/lib/router-compat";
import { useCareerPlan, type PlanStep } from "@/hooks/useCareerPlan";

const KIND_LABEL: Record<PlanStep["kind"], string> = {
  apply: "Apply",
  tailor: "Tailor",
  outreach: "Outreach",
  prep: "Prep",
  research: "Research",
};

const KIND_CHIP: Record<PlanStep["kind"], string> = {
  apply: "bg-primary/15 text-primary",
  tailor: "bg-warning/15 text-warning",
  outreach: "bg-success/15 text-success",
  prep: "bg-destructive/10 text-destructive",
  research: "bg-secondary text-muted-foreground",
};

const DAY_LABEL = ["Today", "Tomorrow", "Day 3"];

export function NextThreeDays() {
  const { plan, isExpired, isLoading, generate, isGenerating, toggleStep } = useCareerPlan();
  const navigate = useNavigate();
  const reduce = useReducedMotion();

  const done = plan?.steps.filter((s) => s.done).length ?? 0;
  const total = plan?.steps.length ?? 0;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <section aria-labelledby="plan-heading" className="glass-card p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="plan-heading" className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <CalendarRange className="h-4 w-4 text-primary" aria-hidden />
            Your next 3 days
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {plan
              ? (plan.summary ?? "A sequenced plan built from your resume, pipeline and prep history.")
              : "A sequenced plan built from your resume, pipeline and prep history."}
          </p>
        </div>
        {plan && (
          <Button variant="ghost" size="sm" onClick={() => generate()} disabled={isGenerating}>
            {isGenerating ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" aria-hidden />
            )}
            Rebuild
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="mt-5 space-y-2" aria-hidden>
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-lg bg-secondary/50" />
          ))}
        </div>
      ) : !plan ? (
        <div className="mt-5 rounded-xl border border-dashed border-border p-6 text-center">
          <Sparkles className="mx-auto h-5 w-5 text-primary" aria-hidden />
          <p className="mt-2 text-sm text-foreground">No plan yet</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            Gradr sequences tailoring, applying, outreach and interview prep around what your data actually says you need.
          </p>
          <Button className="mt-4" onClick={() => generate()} disabled={isGenerating}>
            {isGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <Sparkles className="mr-2 h-4 w-4" aria-hidden />}
            Build my 3-day plan
          </Button>
        </div>
      ) : (
        <>
          <div className="mt-4 flex items-center gap-3">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
              <motion.div
                className="h-full rounded-full bg-primary"
                initial={reduce ? false : { width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.5 }}
              />
            </div>
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
              {done}/{total} done
            </span>
          </div>

          {isExpired && (
            <p className="mt-3 rounded-lg bg-warning/10 px-3 py-2 text-xs text-warning">
              This plan is more than three days old — rebuild it for a current sequence.
            </p>
          )}

          <div className="mt-4 space-y-5">
            {[1, 2, 3].map((day) => {
              const steps = plan.steps.filter((s) => s.day === day);
              if (steps.length === 0) return null;
              return (
                <div key={day}>
                  <h3 className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{DAY_LABEL[day - 1]}</h3>
                  <ul className="mt-2 space-y-2">
                    {steps.map((step) => (
                      <li
                        key={step.id}
                        className={`flex items-start gap-3 rounded-lg border p-3 transition-colors ${
                          step.done ? "border-success/40 bg-success/5" : "border-border/60 bg-secondary/40"
                        }`}
                      >
                        <Checkbox
                          id={`step-${step.id}`}
                          checked={step.done}
                          onCheckedChange={(v) => toggleStep(step.id, v === true)}
                          className="mt-0.5"
                          aria-label={`Mark "${step.title}" as ${step.done ? "not done" : "done"}`}
                        />
                        <div className="min-w-0 flex-1">
                          <label
                            htmlFor={`step-${step.id}`}
                            className={`block text-sm font-medium ${step.done ? "text-muted-foreground line-through" : "text-foreground"}`}
                          >
                            {step.title}
                          </label>
                          <p className="mt-0.5 text-xs text-muted-foreground">{step.detail}</p>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <span className={`rounded-full px-2 py-0.5 text-[0.65rem] uppercase tracking-wide ${KIND_CHIP[step.kind]}`}>
                              {KIND_LABEL[step.kind]}
                            </span>
                            <span className="text-[0.7rem] text-muted-foreground">{step.minutes} min</span>
                            <button
                              type="button"
                              onClick={() => navigate(step.to)}
                              className="inline-flex items-center gap-1 text-[0.7rem] text-primary hover:underline"
                            >
                              Open <ArrowRight className="h-3 w-3" aria-hidden />
                            </button>
                          </div>
                        </div>
                        {step.done && <Check className="mt-1 h-4 w-4 shrink-0 text-success" aria-hidden />}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
