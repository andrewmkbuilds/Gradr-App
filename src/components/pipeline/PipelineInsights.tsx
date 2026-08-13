import { useMemo } from "react";
import { AlertTriangle, ArrowRight, Flame, TrendingDown, TrendingUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "@/lib/router-compat";
import { buildPipelineInsight, type PipelineJob } from "@/lib/pipelineInsights";

const CTA_ROUTE: Record<string, string> = {
  "Find roles": "/jobs",
  "Open follow-ups": "/pipeline",
  "Build application": "/apply",
  "Check resume": "/resume",
  "Start mock interview": "/interview",
};

interface Props {
  jobs: PipelineJob[];
  /** Called when the user picks a stalled job so the parent can open its drawer. */
  onOpenJob?: (id: string) => void;
}

/** Conversion funnel, stall detection and the single highest-value next action. */
export function PipelineInsights({ jobs, onOpenJob }: Props) {
  const navigate = useNavigate();
  const insight = useMemo(() => buildPipelineInsight(jobs), [jobs]);

  if (insight.total === 0 && !insight.nextAction) return null;

  const maxCount = Math.max(...insight.funnel.map((f) => f.count), 1);

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="p-5 lg:col-span-2">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-foreground">Pipeline conversion</h3>
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            {insight.velocityDelta >= 0 ? (
              <TrendingUp className="h-3.5 w-3.5 text-success" aria-hidden />
            ) : (
              <TrendingDown className="h-3.5 w-3.5 text-warning" aria-hidden />
            )}
            {insight.appliedLast7} applied this week
            {insight.appliedPrev7 > 0 && (
              <span className={insight.velocityDelta >= 0 ? "text-success" : "text-warning"}>
                ({insight.velocityDelta >= 0 ? "+" : ""}
                {insight.velocityDelta} vs last)
              </span>
            )}
          </span>
        </div>

        <ul className="space-y-2.5">
          {insight.funnel.map((step) => (
            <li key={step.label} className="flex items-center gap-3">
              <span className="w-20 shrink-0 text-xs text-muted-foreground">{step.label}</span>
              <div className="h-6 flex-1 overflow-hidden rounded-md bg-secondary/60">
                <div
                  className="h-full rounded-md bg-linear-to-r from-primary/70 to-primary transition-all duration-500"
                  style={{ width: `${Math.max(3, (step.count / maxCount) * 100)}%` }}
                />
              </div>
              <span className="w-24 shrink-0 text-right text-xs tabular-nums text-foreground">
                {step.count}
                {step.rate !== null && (
                  <span className="ml-1.5 text-muted-foreground">{step.rate}%</span>
                )}
              </span>
            </li>
          ))}
        </ul>

        {insight.stale.length > 0 && (
          <div className="mt-5 border-t border-border/60 pt-4">
            <p className="mb-2 flex items-center gap-2 text-xs font-semibold text-foreground">
              <AlertTriangle className="h-3.5 w-3.5 text-warning" aria-hidden />
              Going cold ({insight.stale.length})
            </p>
            <ul className="space-y-1.5">
              {insight.stale.map(({ job, days, reason }) => (
                <li key={job.id}>
                  <button
                    type="button"
                    onClick={() => onOpenJob?.(job.id)}
                    className="flex w-full items-center justify-between gap-3 rounded-lg bg-secondary/50 px-3 py-2 text-left transition-colors hover:bg-secondary"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-foreground">
                        {job.title}
                        {job.company ? ` · ${job.company}` : ""}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">{reason}</span>
                    </span>
                    <Badge variant="secondary" className="shrink-0 bg-warning/15 text-warning">
                      {days}d quiet
                    </Badge>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      {insight.nextAction && (
        <Card className="flex flex-col justify-between gap-4 border-primary/30 p-5">
          <div>
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-primary">
              <Flame className="h-3.5 w-3.5" aria-hidden /> Do this next
            </p>
            <h3 className="mt-2 text-sm font-semibold text-foreground">{insight.nextAction.title}</h3>
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
              {insight.nextAction.body}
            </p>
          </div>
          <Button
            size="sm"
            className="w-full gap-2"
            onClick={() => navigate(CTA_ROUTE[insight.nextAction!.cta] ?? "/pipeline")}
          >
            {insight.nextAction.cta} <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Button>
        </Card>
      )}
    </div>
  );
}
