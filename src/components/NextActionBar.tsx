import { ArrowRight, AlertTriangle, Sparkles, Target } from "lucide-react";
import { useNavigate } from "@/lib/router-compat";
import { Button } from "@/components/ui/button";
import { useCareerSignals, actionForSurface, type Surface } from "@/lib/careerSignals";
import type { NextAction } from "@/lib/careerBriefing";

const TONE: Record<NextAction["tone"], { chip: string; icon: typeof Target }> = {
  critical: { chip: "bg-destructive/15 text-destructive", icon: AlertTriangle },
  primary: { chip: "bg-primary/15 text-primary", icon: Sparkles },
  steady: { chip: "bg-mahogany/12 text-mahogany", icon: Target },
};

/**
 * The one consistent "what should I do next" strip, shown on every product
 * surface. Same data, same ranking, same language as the dashboard briefing.
 */
export function NextActionBar({ surface }: { surface: Surface }) {
  const navigate = useNavigate();
  const { data } = useCareerSignals();

  if (!data) return null;
  const picked = actionForSurface(data.briefing, surface);
  if (!picked) return null;

  const { action, isHandoff } = picked;
  const tone = TONE[action.tone];
  const Icon = tone.icon;

  return (
    <section
      aria-label="Recommended next action"
      className="lume-border glass-panel relative overflow-hidden rounded-2xl"
    >
      <div className="pointer-events-none absolute -right-20 -top-24 h-48 w-48 rounded-full bg-primary/10 blur-3xl" aria-hidden />
      <div className="relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 p-4 sm:p-5">
        <div className="flex min-w-0 items-start gap-3">
          <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${tone.chip}`}>
            <Icon className="h-4 w-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-[0.65rem] uppercase tracking-[0.18em] text-muted-foreground">
              {isHandoff ? "Higher-impact elsewhere" : "Next best action"}
              <span className="ml-2 tabular-nums opacity-70">Readiness {data.briefing.readiness}</span>
            </p>
            <p className="mt-0.5 truncate text-sm font-semibold text-foreground">{action.label}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{action.reason}</p>
          </div>
        </div>
        <Button size="sm" className="shrink-0" onClick={() => navigate(action.to)}>
          {action.cta}
          <ArrowRight className="ml-1.5 h-3.5 w-3.5" aria-hidden />
        </Button>
      </div>
    </section>
  );
}
