import { Check, ArrowRight } from "lucide-react";
import { motion } from "framer-motion";
import { useNavigate } from "@/lib/router-compat";
import { MotionPressable } from "@/components/motion";
import { spring, stagger } from "@/lib/motion";
import type { SetupStep } from "@/lib/careerBriefing";

export function GettingStarted({ steps }: { steps: SetupStep[] }) {
  const navigate = useNavigate();
  const done = steps.filter((s) => s.done).length;
  const pct = Math.round((done / steps.length) * 100);

  if (done === steps.length) return null;

  return (
    <section aria-labelledby="setup-heading" className="lume-border glass-panel rounded-2xl p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="setup-heading" className="text-sm font-semibold text-foreground">
          Finish setting up Gradr
        </h2>
        <span className="text-xs tabular-nums text-muted-foreground">
          {done} of {steps.length} complete
        </span>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-secondary">
        <motion.div
          className="h-full rounded-full bg-primary"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={spring.soft}
        />
      </div>

      <motion.ol
        className="mt-5 grid gap-2.5 sm:grid-cols-2"
        initial="hidden"
        animate="visible"
        variants={{ visible: { transition: { staggerChildren: stagger.tight } } }}
      >
        {steps.map((step, i) => (
          <motion.li
            key={step.id}
            variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0 } }}
            transition={spring.smooth}
          >
            <MotionPressable
              onClick={() => navigate(step.to)}
              className={`group flex w-full items-start gap-3 rounded-xl border p-3.5 text-left transition-colors ${
                step.done ? "border-success/30 bg-success/5" : "border-border bg-background/40 hover:bg-secondary/60"
              }`}
            >
              <span
                className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                  step.done ? "bg-success/20 text-success" : "bg-secondary text-muted-foreground"
                }`}
                aria-hidden
              >
                {step.done ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block text-sm font-medium ${step.done ? "text-muted-foreground line-through" : "text-foreground"}`}>
                  {step.label}
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{step.description}</span>
              </span>
              {!step.done && (
                <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-primary transition-transform group-hover:translate-x-0.5" aria-hidden />
              )}
            </MotionPressable>
          </motion.li>
        ))}
      </motion.ol>
    </section>
  );
}
