import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import type { ReadinessPillar } from "./CareerReadiness";

function clamp(n: number) {
  return Math.max(0, Math.min(100, Math.round(n || 0)));
}

/**
 * Per-pillar drill-down: the exact factors behind the number plus the next
 * actions that move it. Opened from any pillar row on the readiness card.
 */
export function PillarDrilldown({
  pillar,
  totalWeight,
  onOpenChange,
}: {
  pillar: ReadinessPillar | null;
  totalWeight: number;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  if (!pillar) return null;

  const v = clamp(pillar.value);
  const contribution = Math.round((v * pillar.weight) / (totalWeight || 1));
  const headroom = Math.round(((100 - v) * pillar.weight) / (totalWeight || 1));

  return (
    <Dialog open={!!pillar} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display">{pillar.label}</DialogTitle>
          <DialogDescription>{pillar.hint}</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "Score", value: `${v}/100` },
            { label: "Contributes", value: `+${contribution} pts` },
            { label: "Headroom", value: `+${headroom} pts` },
          ].map((m) => (
            <div key={m.label} className="elev-1 rounded-lg p-3">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{m.label}</p>
              <p className="mt-1 text-sm font-semibold tabular-nums text-foreground">{m.value}</p>
            </div>
          ))}
        </div>

        {pillar.signals && pillar.signals.length > 0 && (
          <section aria-labelledby={`factors-${pillar.key}`}>
            <h4 id={`factors-${pillar.key}`} className="mb-2 text-xs font-semibold text-foreground">
              Factors behind this score
            </h4>
            <dl className="divide-y divide-border/60 rounded-lg border border-border/60">
              {pillar.signals.map((sig) => (
                <div key={sig.label} className="flex items-baseline justify-between gap-3 px-3 py-2 text-xs">
                  <dt className="text-muted-foreground">{sig.label}</dt>
                  <dd className="tabular-nums text-foreground">{sig.value}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        {pillar.actions && pillar.actions.length > 0 && (
          <section aria-labelledby={`actions-${pillar.key}`}>
            <h4 id={`actions-${pillar.key}`} className="mb-2 text-xs font-semibold text-foreground">
              Suggested next actions
            </h4>
            <ul className="space-y-2">
              {pillar.actions.map((a) => (
                <li key={a.label}>
                  <button
                    type="button"
                    onClick={() => {
                      if (a.to) {
                        onOpenChange(false);
                        navigate(a.to);
                      }
                    }}
                    disabled={!a.to}
                    className="elev-1 elev-interactive flex min-h-11 w-full items-center justify-between gap-3 rounded-lg p-3 text-left disabled:cursor-default disabled:opacity-100"
                  >
                    <span>
                      <span className="block text-sm font-medium text-foreground">{a.label}</span>
                      {a.detail && <span className="mt-0.5 block text-xs text-muted-foreground">{a.detail}</span>}
                    </span>
                    {a.to && <ArrowRight className="h-4 w-4 shrink-0 text-mahogany" aria-hidden="true" />}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </DialogContent>
    </Dialog>
  );
}
