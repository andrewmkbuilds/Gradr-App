import { Link } from "react-router-dom";
import { CheckCircle2, Circle, ExternalLink, Loader2, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ds/Button";
import { Progress } from "@/components/ui/progress";
import { goLiveProgress, type GoLiveState, type GoLiveStep } from "@/lib/payments/goLive";

const STATE_META: Record<
  GoLiveState,
  { icon: typeof CheckCircle2; className: string; label: string }
> = {
  done: { icon: CheckCircle2, className: "text-success", label: "Done" },
  blocked: { icon: XCircle, className: "text-destructive", label: "Blocked" },
  todo: { icon: Circle, className: "text-warning", label: "Remaining" },
  pending: { icon: Loader2, className: "text-muted-foreground", label: "Checking" },
};

function StepRow({ step }: { step: GoLiveStep }) {
  const meta = STATE_META[step.state];
  const Icon = meta.icon;
  const action = step.action;

  return (
    <li className="flex flex-wrap items-start gap-3 border-b border-border/60 py-3 last:border-0">
      <Icon
        className={`mt-0.5 h-4 w-4 shrink-0 ${meta.className} ${step.state === "pending" ? "animate-spin" : ""}`}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <p className="text-body-sm font-medium text-foreground">{step.title}</p>
        <p className="text-body-sm text-muted-foreground">{step.detail}</p>
      </div>
      <Badge variant="outline" className={meta.className}>
        {meta.label}
      </Badge>
      {action && step.state !== "done" && (
        <Button asChild variant="outline" size="sm">
          {action.external ? (
            <a href={action.href} target="_blank" rel="noopener noreferrer">
              <span className="inline-flex items-center gap-1.5">
                {action.label}
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
            </a>
          ) : (
            <Link to={action.href}>{action.label}</Link>
          )}
        </Button>
      )}
    </li>
  );
}

/**
 * Go-live checklist: what is already satisfied, what is left, and exactly one
 * next action per remaining item. Steps are computed by `buildGoLiveChecklist`
 * from live runtime signals, so nothing here is aspirational copy.
 */
export function GoLiveChecklist({ steps }: { steps: GoLiveStep[] }) {
  const { done, total, blocked } = goLiveProgress(steps);

  return (
    <Card className="p-5" id="go-live">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-body font-semibold text-foreground">Paddle go-live checklist</h2>
          <p className="text-body-sm text-muted-foreground">
            {done} of {total} steps complete
            {blocked > 0 ? ` · ${blocked} blocking live checkout` : ""}.
          </p>
        </div>
        <Badge
          variant="outline"
          className={blocked > 0 ? "text-destructive" : done === total ? "text-success" : "text-warning"}
        >
          {blocked > 0 ? "Blocked" : done === total ? "Ready" : "In progress"}
        </Badge>
      </div>

      <Progress
        className="mt-3"
        value={total ? (done / total) * 100 : 0}
        aria-label="Go-live progress"
      />


      <ul className="mt-3">
        {steps.map((step) => (
          <StepRow key={step.id} step={step} />
        ))}
      </ul>
    </Card>
  );
}
