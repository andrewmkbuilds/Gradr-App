import { FileText, Zap, Mic, Infinity as InfinityIcon, ArrowUpRight, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useNavigate } from "react-router-dom";
import { useCredits, useEntitlements } from "@/hooks/useSubscription";
import { formatDistanceToNowStrict } from "date-fns";

type FeatureKey = "resume" | "application" | "interview";

const FEATURES: { key: FeatureKey; label: string; hint: string; icon: typeof FileText; credits?: "application" | "interview" }[] = [
  { key: "resume", label: "Resume analyses", hint: "ATS scoring and rewrite suggestions", icon: FileText },
  { key: "application", label: "Application packages", hint: "Tailored resume + cover letter", icon: Zap, credits: "application" },
  { key: "interview", label: "Mock interviews", hint: "AI interview sessions and reports", icon: Mic, credits: "interview" },
];

/** First moment of next month — when monthly allowances reset. */
function nextReset() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 1);
}

/** Human copy for the exact reset rule, so nobody has to guess the basis. */
function resetBasis(reset: Date) {
  return `Calendar month (not billing anniversary). Counters return to 0 at ${reset.toLocaleString(
    undefined,
    { month: "long", day: "numeric", hour: "numeric", minute: "2-digit" },
  )} — the 1st of next month, your local time.`;
}

interface UsageBarsProps {
  /** Compact variant drops the header and upgrade CTA. */
  compact?: boolean;
}

/** Per-feature monthly usage, remaining credits and reset timing. */
export function UsageBars({ compact }: UsageBarsProps) {
  const { data: snapshot, isLoading } = useEntitlements();
  const { data: credits } = useCredits();
  const navigate = useNavigate();

  const reset = nextReset();
  const tier = snapshot?.tier ?? "free";

  if (isLoading) {
    return (
      <div className="elev-2 rounded-xl p-6 space-y-4" aria-busy="true">
        <div className="h-4 w-40 rounded bg-muted/40 animate-pulse" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-12 rounded bg-muted/20 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={150}>
      <section className="elev-2 rounded-xl p-6 space-y-5" aria-label="Monthly usage">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Monthly usage</h2>
            <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5">
              <span>
                {tier === "pro" || tier === "advanced"
                  ? `${tier[0].toUpperCase()}${tier.slice(1)} plan — unlimited AI runs`
                  : `${tier[0].toUpperCase()}${tier.slice(1)} plan`}
                {" · "}
                Resets in {formatDistanceToNowStrict(reset)}
              </span>
              <Tooltip>
                <TooltipTrigger aria-label="How monthly limits reset">
                  <Info className="h-3.5 w-3.5 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent className="max-w-72 text-xs leading-relaxed">
                  {resetBasis(reset)} Purchased credits never expire and are only spent once the plan allowance
                  for that feature is used up.
                </TooltipContent>
              </Tooltip>
            </p>
          </div>
          {!compact && tier !== "pro" && tier !== "advanced" && (
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => navigate("/pricing")}>
              Upgrade <ArrowUpRight className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>

        <ul className="space-y-4">
          {FEATURES.map(({ key, label, hint, icon: Icon, credits: creditKey }) => {
            const f = snapshot?.features[key] ?? { allowance: 0, used: 0, remaining: 0 };
            const unlimited = f.allowance === null;
            const allowance = f.allowance ?? 0;
            const pct = unlimited ? 100 : Math.min(100, Math.round((f.used / Math.max(allowance, 1)) * 100));
            const extra = creditKey
              ? creditKey === "application"
                ? credits?.application_credits ?? 0
                : credits?.interview_credits ?? 0
              : 0;
            // Runs taken beyond the plan allowance — these were paid for with credits.
            const overage = unlimited ? 0 : Math.max(f.used - allowance, 0);
            const low = !unlimited && (f.remaining ?? 0) <= 0 && extra <= 0;

            return (
              <li key={key} className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 min-w-0">
                    <Icon className="h-4 w-4 text-primary shrink-0" />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-foreground truncate">{label}</span>
                      <span className="block text-xs text-muted-foreground truncate">{hint}</span>
                    </span>
                  </span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span
                        tabIndex={0}
                        aria-label={`${label} usage details`}
                        className={`text-xs font-medium shrink-0 cursor-help rounded outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                          low ? "text-destructive" : "text-muted-foreground"
                        }`}
                      >
                        {unlimited ? (
                          <span className="inline-flex items-center gap-1 text-foreground">
                            <InfinityIcon className="h-3.5 w-3.5" /> Unlimited
                          </span>
                        ) : (
                          <>
                            <span className="text-foreground">{f.used}</span> / {allowance} used
                          </>
                        )}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-72 text-xs leading-relaxed space-y-1">
                      <p className="font-medium text-foreground">{label}</p>
                      <dl className="space-y-0.5">
                        <Row term="Used this month" value={String(f.used)} />
                        <Row term="Plan allowance" value={unlimited ? "Unlimited" : `${allowance} / month`} />
                        <Row
                          term="Remaining"
                          value={unlimited ? "No cap" : String(Math.max(f.remaining ?? 0, 0))}
                        />
                        <Row term="Overage runs" value={unlimited ? "0 (unlimited plan)" : String(overage)} />
                        {creditKey && (
                          <Row term="Credits available" value={`${extra} credit${extra === 1 ? "" : "s"}`} />
                        )}
                      </dl>
                      <p className="text-muted-foreground pt-1 border-t border-border/60">
                        {resetBasis(reset)}
                        {creditKey
                          ? " Overage runs draw from purchased credits, which do not reset."
                          : " This feature has no credit pack — extra runs need a plan upgrade."}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </div>

                <Progress
                  value={unlimited ? 100 : pct}
                  aria-label={`${label} usage`}
                  className={low ? "[&>div]:bg-destructive" : undefined}
                />

                <p className="text-xs text-muted-foreground">
                  {unlimited
                    ? "No monthly cap on your plan."
                    : `${Math.max(f.remaining ?? 0, 0)} left this month`}
                  {creditKey && !unlimited && (
                    <>
                      {" · "}
                      {extra} extra credit{extra === 1 ? "" : "s"}
                    </>
                  )}
                  {overage > 0 && (
                    <>
                      {" · "}
                      <span className="text-warning">{overage} over allowance</span>
                    </>
                  )}
                </p>
              </li>
            );
          })}
        </ul>
      </section>
    </TooltipProvider>
  );
}

function Row({ term, value }: { term: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-muted-foreground">{term}</dt>
      <dd className="tabular-nums text-foreground">{value}</dd>
    </div>
  );
}
