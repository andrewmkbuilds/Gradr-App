import { useState } from "react";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, CalendarClock, CreditCard, Loader2, RotateCcw, ShieldCheck, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ds/Button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Seo } from "@/components/Seo";
import { TrialBanner } from "@/components/billing/TrialBanner";
import { useRealtimeBilling } from "@/hooks/useRealtimeBilling";
import { useSubscriptionActions, useSubscriptionDetails } from "@/hooks/useSubscriptionManagement";
import { PLAN_PRICING, type PlanId } from "@/config/pricing";

const TIER_RANK: Record<string, number> = { free: 0, starter: 1, pro: 2, advanced: 3 };

function formatDay(value: string | null | undefined) {
  if (!value) return null;
  return new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function formatAmount(minor: string | number | null | undefined, currency: string | null | undefined) {
  const value = Number(minor ?? 0);
  if (!value) return null;
  return new Intl.NumberFormat(undefined, { style: "currency", currency: (currency ?? "USD").toUpperCase() })
    .format(value / 100);
}

export default function Subscription() {
  const navigate = useNavigate();
  useRealtimeBilling();
  const { data, isLoading, isError, refetch, isFetching } = useSubscriptionDetails();
  const { updatePaymentMethod, cancel, resume, changePlan, cancelScheduledPlanChange } = useSubscriptionActions();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [immediate, setImmediate] = useState(false);
  const [reason, setReason] = useState("");

  const planId = (data?.tier ?? "free") as PlanId;
  const planName = PLAN_PRICING[planId]?.name ?? "Free";
  const card = data?.paymentMethod?.card;
  const renews = formatDay(data?.nextBilledAt ?? data?.currentPeriodEnd);
  const nextCharge = formatAmount(data?.nextChargeAmount, data?.currency);
  const dunningActive = data?.dunning?.status === "active";
  const pending = data?.pendingPlanChange ?? null;

  const currentRank = TIER_RANK[planId] ?? 0;
  const currentInterval = data?.interval === "annual" ? "annual" : "monthly";

  /** Every other plan/interval combination the customer can move to. */
  const switchOptions = (["starter", "pro", "advanced"] as const).flatMap((tier) =>
    (["monthly", "annual"] as const).map((interval) => ({
      tier,
      interval,
      priceId: PLAN_PRICING[tier].priceId![interval],
      name: PLAN_PRICING[tier].name,
      amount: interval === "annual" ? PLAN_PRICING[tier].annual : PLAN_PRICING[tier].monthly,
      isUpgrade: TIER_RANK[tier] > currentRank ||
        (TIER_RANK[tier] === currentRank && interval === "annual" && currentInterval === "monthly"),
    })),
  ).filter((o) => !(o.tier === planId && o.interval === currentInterval));

  const openCancel = (immediateCancel: boolean) => {
    setImmediate(immediateCancel);
    setCancelOpen(true);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Seo
        title="Manage subscription"
        description="Update your payment method, review renewal details, or cancel your Gradr plan."
        path="/subscription"
      />

      <header>
        <h1 className="type-h1 text-foreground">Manage subscription</h1>
        <p className="text-sm text-muted-foreground">
          Everything about your plan — renewal, payment method and cancellation — in one place.
        </p>
      </header>

      <TrialBanner />

      {isLoading ? (
        <Card className="space-y-4 p-6">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-72" />
          <Skeleton className="h-10 w-40" />
        </Card>
      ) : isError ? (
        <Card className="space-y-4 p-6" role="alert">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive" aria-hidden />
            <h2 className="text-h6 text-foreground">We couldn't load your subscription</h2>
          </div>
          <p className="text-body-sm text-muted-foreground">
            Your plan is safe — this is only a problem reading the billing service. Try again, or email{" "}
            <a className="underline hover:text-foreground" href="mailto:support@gradr.me">support@gradr.me</a>{" "}
            if it keeps happening.
          </p>

          <Button
            variant="secondary"
            className="self-start"
            loading={isFetching}
            onClick={() => void refetch()}
          >
            Try again
          </Button>

        </Card>
      ) : !data?.hasSubscription ? (

        <Card className="space-y-4 p-6">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" aria-hidden />
            <h2 className="text-sm font-semibold text-foreground">You're on the Free plan</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Upgrade to unlock unlimited AI analysis, mock interviews and coaching.
          </p>
          <Button className="gap-2 self-start" onClick={() => navigate("/pricing")}>
            <Sparkles className="h-4 w-4" aria-hidden />
            View plans
          </Button>
        </Card>
      ) : (
        <>
          {dunningActive && (
            <Card className="border-destructive/40 bg-destructive/5 p-5">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 text-destructive" aria-hidden />
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-foreground">We couldn't take your last payment</p>
                  <p className="text-sm text-muted-foreground">
                    Attempt {data.dunning?.attempt_count} of {data.dunning?.max_attempts}
                    {data.dunning?.next_retry_at ? ` · next retry ${formatDay(data.dunning.next_retry_at)}` : ""}.
                    Update your card to settle it instantly and keep your plan active.
                  </p>
                  <Button
                    size="sm"
                    className="mt-2 gap-2"
                    onClick={() => updatePaymentMethod.mutate()}
                    disabled={updatePaymentMethod.isPending}
                  >
                    {updatePaymentMethod.isPending
                      ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      : <CreditCard className="h-4 w-4" aria-hidden />}
                    Update payment method
                  </Button>
                </div>
              </div>
            </Card>
          )}

          <Card className="space-y-5 p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-primary" aria-hidden />
                  <h2 className="text-sm font-semibold text-foreground">Current plan</h2>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="type-h1 text-foreground">
                    Gradr {planName} {data.interval === "annual" ? "(Annual)" : "(Monthly)"}
                  </span>
                  {data.status && <Badge variant={data.status === "active" ? "default" : "secondary"}>{data.status}</Badge>}
                  {data.cancelAtPeriodEnd && <Badge variant="outline">Cancels at period end</Badge>}
                </div>
              </div>
              <Button variant="ghost" className="gap-2" onClick={() => navigate("/pricing")}>
                Compare plans
              </Button>
            </div>

            <dl className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg border border-border/70 p-4">
                <dt className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <CalendarClock className="h-3.5 w-3.5" aria-hidden />
                  {data.cancelAtPeriodEnd ? "Access until" : "Renews"}
                </dt>
                <dd className="mt-1 text-sm text-foreground">
                  {renews ?? "—"}
                  {!data.cancelAtPeriodEnd && nextCharge ? ` · ${nextCharge}` : ""}
                </dd>
              </div>
              <div className="rounded-lg border border-border/70 p-4">
                <dt className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <CreditCard className="h-3.5 w-3.5" aria-hidden />
                  Payment method
                </dt>
                <dd className="mt-1 text-sm text-foreground">
                  {card?.last4
                    ? `${(card.type ?? "card").toUpperCase()} ···· ${card.last4}${
                      card.expiry_month ? ` · exp ${String(card.expiry_month).padStart(2, "0")}/${card.expiry_year}` : ""
                    }`
                    : data.paymentMethod?.type ?? "—"}
                </dd>
              </div>
            </dl>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => updatePaymentMethod.mutate()}
                disabled={updatePaymentMethod.isPending}
              >
                {updatePaymentMethod.isPending
                  ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  : <CreditCard className="h-4 w-4" aria-hidden />}
                Update payment method
              </Button>

              {data.cancelAtPeriodEnd
                ? (
                  <Button className="gap-2" onClick={() => resume.mutate()} disabled={resume.isPending}>
                    {resume.isPending
                      ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      : <RotateCcw className="h-4 w-4" aria-hidden />}
                    Keep my subscription
                  </Button>
                )
                : (
                  <Button variant="ghost" className="text-muted-foreground" onClick={() => openCancel(false)}>
                    Cancel at period end
                  </Button>
                )}
              <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={() => openCancel(true)}>
                Cancel immediately
              </Button>
            </div>
          </Card>

          {pending && (
            <Card className="border-primary/30 bg-primary/5 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-foreground">
                    Switching to {PLAN_PRICING[pending.target_tier as PlanId]?.name ?? pending.target_tier}
                    {pending.target_interval === "annual" ? " (Annual)" : " (Monthly)"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    You keep your current plan until {formatDay(pending.effective_at) ?? "your renewal date"} — the change
                    applies then, so nothing you paid for is lost.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => cancelScheduledPlanChange.mutate()}
                  disabled={cancelScheduledPlanChange.isPending}
                >
                  {cancelScheduledPlanChange.isPending
                    ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                    : null}
                  Keep current plan
                </Button>
              </div>
            </Card>
          )}

          <Card className="space-y-4 p-6">
            <div className="space-y-1">
              <h2 className="text-sm font-semibold text-foreground">Change plan</h2>
              <p className="text-sm text-muted-foreground">
                Upgrades start immediately and are charged pro rata. Downgrades take effect at your next renewal, so you
                keep the plan you paid for until then.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {switchOptions.map((option) => (
                <div
                  key={option.priceId}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border/70 p-4"
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      Gradr {option.name} {option.interval === "annual" ? "(Annual)" : "(Monthly)"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatAmount(option.amount, "USD")} / {option.interval === "annual" ? "year" : "month"}
                      {option.interval === "annual" ? " · includes bonus credits" : ""}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant={option.isUpgrade ? "default" : "outline"}
                    className="gap-1.5 whitespace-nowrap"
                    onClick={() =>
                      changePlan.mutate({ priceId: option.priceId, tier: option.tier, interval: option.interval })}
                    disabled={changePlan.isPending}
                  >
                    {changePlan.isPending
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                      : option.isUpgrade
                        ? <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                        : <ArrowDownRight className="h-3.5 w-3.5" aria-hidden />}
                    {option.isUpgrade ? "Upgrade now" : "Switch at renewal"}
                  </Button>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}

      <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {immediate ? "Cancel and lose access now?" : "Cancel at the end of your period?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {immediate
                ? "Your plan ends straight away and premium features lock immediately. This can't be undone — you'd need to subscribe again."
                : `You keep everything until ${renews ?? "the end of your paid period"}. You can undo this any time before then.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label htmlFor="cancel-reason" className="text-xs text-muted-foreground">
              Anything we could have done better? (optional)
            </Label>
            <Textarea
              id="cancel-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Too expensive, missing a feature, found another tool…"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep my plan</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                cancel.mutate({ immediate, reason });
                setCancelOpen(false);
                setReason("");
              }}
            >
              {immediate ? "Cancel now" : "Schedule cancellation"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
