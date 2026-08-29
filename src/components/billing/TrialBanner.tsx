import { Link } from "react-router-dom";
import { Sparkles } from "lucide-react";
import { useSubscription } from "@/hooks/useSubscription";
import { PLAN_PRICING, formatUsd, type PlanId } from "@/config/pricing";

function formatDay(value: string | null) {
  if (!value) return null;
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * Trial countdown for anyone inside their free trial.
 *
 * The trial is full plan access with nothing charged yet, so the one thing the
 * customer needs to know is when the first payment lands and how to stop it —
 * anything less is a surprise charge.
 */
export function TrialBanner({ className }: { className?: string }) {
  const { isTrialing, trialDaysLeft, trialEnd, plan, billingInterval, cancelAtPeriodEnd } = useSubscription();
  if (!isTrialing) return null;

  const pricing = PLAN_PRICING[(plan as PlanId) ?? "pro"] ?? PLAN_PRICING.pro;
  const amount = formatUsd(billingInterval === "annual" ? pricing.annual : pricing.monthly);
  const endsOn = formatDay(trialEnd);
  const daysCopy = trialDaysLeft === null
    ? "Your free trial is running"
    : trialDaysLeft <= 1
      ? "Last day of your free trial"
      : `${trialDaysLeft} days left in your free trial`;

  return (
    <div
      role="status"
      data-testid="trial-banner"
      className={`rounded-card border border-primary/30 bg-primary/5 p-4 ${className ?? ""}`}
    >
      <div className="flex gap-3">
        <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
        <div className="space-y-1">
          <p className="text-body-sm font-semibold text-foreground">
            {daysCopy} — {pricing.name} is fully unlocked
          </p>
          <p className="text-body-sm text-muted-foreground">
            {cancelAtPeriodEnd
              ? `Your trial is set to end${endsOn ? ` on ${endsOn}` : ""} and you won't be charged.`
              : `You haven't been charged. The first payment of ${amount} is taken${endsOn ? ` on ${endsOn}` : " when the trial ends"} unless you cancel before then.`}
          </p>
          {!cancelAtPeriodEnd && (
            <Link to="/subscription" className="inline-block text-body-sm text-primary underline">
              Manage or cancel my trial
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
