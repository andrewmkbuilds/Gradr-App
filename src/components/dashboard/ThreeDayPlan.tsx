import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { formatDistanceToNow } from "date-fns";
import {
  CalendarRange, Check, CheckCircle2, Loader2, RefreshCw, Sparkles, Send, FileText, Users, Mic, Search, ArrowRight,
} from "lucide-react";

import { Surface, SurfaceHeader } from "@/components/ui/surface";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useReducedMotionPref } from "@/hooks/useMotionPreference";
import { easeOut } from "@/lib/motion/tokens";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export interface PlanStep {
  id: string;
  day: number;
  order: number;
  type: "apply" | "tailor" | "outreach" | "interview_prep" | "research" | string;
  title: string;
  detail: string;
  minutes: number;
  target?: string | null;
  route: string;
  done: boolean;
  completed_at: string | null;
}

interface CareerPlan {
  id?: string;
  summary: string | null;
  steps: PlanStep[];
  valid_until: string;
}

const TYPE_META: Record<string, { icon: typeof Send; label: string }> = {
  apply: { icon: Send, label: "Apply" },
  tailor: { icon: FileText, label: "Tailor" },
  outreach: { icon: Users, label: "Outreach" },
  interview_prep: { icon: Mic, label: "Interview prep" },
  research: { icon: Search, label: "Research" },
};

const DAY_LABEL = ["Today", "Tomorrow", "Day 3"];

export function ThreeDayPlan() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const reduced = useReducedMotionPref();
  const [plan, setPlan] = useState<CareerPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("career_plans")
      .select("id, summary, steps, valid_until")
      .eq("user_id", user.id)
      .maybeSingle();
    setPlan(data ? ({ ...data, steps: (data.steps as unknown as PlanStep[]) ?? [] } as CareerPlan) : null);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  const generate = async () => {
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("career-plan", { body: {} });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setPlan({ ...data.plan, steps: (data.plan?.steps ?? []) as PlanStep[] });
      toast.success("Your next 3 days are sequenced");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't build your plan right now");
    } finally {
      setGenerating(false);
    }
  };

  const toggleStep = async (stepId: string) => {
    if (!plan || !user) return;
    const next = plan.steps.map((s) =>
      s.id === stepId ? { ...s, done: !s.done, completed_at: !s.done ? new Date().toISOString() : null } : s,
    );
    setPlan({ ...plan, steps: next });
    const { error } = await supabase
      .from("career_plans")
      .update({ steps: next as unknown as never, updated_at: new Date().toISOString() })
      .eq("user_id", user.id);
    if (error) {
      toast.error("Couldn't save that step");
      void load();
      return;
    }
    const step = next.find((s) => s.id === stepId);
    if (step?.done) toast.success(`Done: ${step.title}`);
  };

  const grouped = useMemo(() => {
    const days: Record<number, PlanStep[]> = { 1: [], 2: [], 3: [] };
    (plan?.steps ?? []).forEach((s) => {
      const d = Math.min(3, Math.max(1, s.day || 1));
      days[d].push(s);
    });
    Object.values(days).forEach((list) => list.sort((a, b) => a.order - b.order));
    return days;
  }, [plan]);

  const total = plan?.steps.length ?? 0;
  const completed = plan?.steps.filter((s) => s.done).length ?? 0;
  const stale = plan ? new Date(plan.valid_until).getTime() < Date.now() : false;

  return (
    <Surface level={3} className="relative overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute -left-20 -top-24 h-56 w-56 rounded-full bg-primary/10 blur-3xl" />
      <SurfaceHeader
        title="Your next 3 days"
        icon={CalendarRange}
        action={
          plan ? (
            <Button size="sm" variant="ghost" className="gap-1.5 text-xs" onClick={generate} disabled={generating}>
              {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Rebuild
            </Button>
          ) : null
        }
      />

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => <div key={i} className="h-16 animate-pulse rounded-lg bg-secondary/60" />)}
        </div>
      ) : !plan || total === 0 ? (
        <div className="py-6 text-center">
          <p className="mx-auto max-w-md text-sm text-muted-foreground">
            Gradr can sequence your next three days from your resume scores, pipeline stage and match quality —
            what to tailor, where to apply, who to reach out to and what to practise.
          </p>
          <Button className="mt-4 gap-2" onClick={generate} disabled={generating}>
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Build my 3-day plan
          </Button>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <div className="h-2 min-w-[140px] flex-1 overflow-hidden rounded-full bg-secondary">
              <motion.div
                className="h-full rounded-full bg-primary"
                style={{ transformOrigin: "left" }}
                initial={{ scaleX: 0 }}
                animate={{ scaleX: total ? completed / total : 0 }}
                transition={reduced ? { duration: 0 } : { duration: 0.6, ease: easeOut }}
              />
            </div>
            <span className="text-xs tabular-nums text-muted-foreground">
              {completed}/{total} complete
            </span>
            {stale && (
              <span className="rounded-full bg-warning/10 px-2 py-0.5 text-[11px] text-warning">
                Plan is older than 3 days — rebuild it
              </span>
            )}
          </div>

          {plan.summary && <p className="mt-3 text-sm text-muted-foreground">{plan.summary}</p>}

          <div className="mt-4 space-y-5">
            {[1, 2, 3].map((day) =>
              grouped[day].length === 0 ? null : (
                <div key={day}>
                  <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                    {DAY_LABEL[day - 1]}
                  </p>
                  <ul className="space-y-2">
                    <AnimatePresence initial={false}>
                      {grouped[day].map((step, i) => {
                        const meta = TYPE_META[step.type] ?? TYPE_META.research;
                        const Icon = meta.icon;
                        return (
                          <motion.li
                            key={step.id}
                            initial={reduced ? false : { opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={reduced ? { duration: 0 } : { duration: 0.35, ease: easeOut, delay: i * 0.05 }}
                            className={cn(
                              "elev-1 flex items-start gap-3 rounded-lg p-3 transition-opacity",
                              step.done && "opacity-60",
                            )}
                          >
                            <button
                              type="button"
                              onClick={() => toggleStep(step.id)}
                              aria-pressed={step.done}
                              aria-label={step.done ? `Mark "${step.title}" as not done` : `Mark "${step.title}" as done`}
                              className={cn(
                                "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-colors",
                                step.done
                                  ? "border-success bg-success text-success-foreground"
                                  : "border-border text-transparent hover:border-mahogany hover:bg-mahogany-soft/60",
                              )}
                            >
                              <Check className="h-3.5 w-3.5" aria-hidden="true" />
                            </button>

                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="accent-chip">
                                  <Icon className="h-3 w-3" aria-hidden="true" /> {meta.label}
                                </span>
                                <span className="text-[11px] text-muted-foreground">{step.minutes} min</span>
                              </div>
                              <p className={cn("mt-1 text-sm font-medium text-foreground", step.done && "line-through")}>
                                {step.title}
                              </p>
                              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{step.detail}</p>
                              {step.target && (
                                <p className="mt-0.5 text-[11px] text-muted-foreground/80">Target: {step.target}</p>
                              )}
                            </div>

                            <Button
                              size="sm"
                              variant="ghost"
                              className="shrink-0 gap-1 text-xs"
                              onClick={() => navigate(step.route)}
                            >
                              Start <ArrowRight className="h-3 w-3" aria-hidden="true" />
                            </Button>
                          </motion.li>
                        );
                      })}
                    </AnimatePresence>
                  </ul>
                </div>
              ),
            )}
          </div>
        </>
      )}
    </Surface>
  );
}
