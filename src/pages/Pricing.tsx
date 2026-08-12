import { Check, Sparkles, Rocket, Zap, Crown, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useBillingActions, useSubscription } from "@/hooks/useSubscription";
import { CREDIT_PACKS, FREE_TIER, TIERS, type Tier } from "@/config/tiers";
import { previewPrices, type PreviewedPrice } from "@/lib/paddle";
import type { PlanKey } from "@/lib/billing";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { PaymentsConfigBanner } from "@/components/PaymentsConfigBanner";

const TIER_ICONS: Record<string, typeof Sparkles> = {
  Starter: Zap,
  Pro: Rocket,
  Advanced: Crown,
};

export default function Pricing() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { plan: currentPlan, billingInterval } = useSubscription();
  const { pending, startSubscription, buyPack } = useBillingActions();
  const [tab, setTab] = useState<"plans" | "packs">("plans");
  const [interval, setInterval] = useState<"monthly" | "annual">("annual");

  const [prices, setPrices] = useState<Record<string, PreviewedPrice>>({});
  const [pricesLoading, setPricesLoading] = useState(true);
  const [pricesError, setPricesError] = useState<string | null>(null);

  // Localized prices come straight from Paddle — no client-side math, no
  // re-formatting of the strings Paddle returns.
  useEffect(() => {
    let cancelled = false;
    const ids = [
      ...TIERS.flatMap((t) => [t.priceId.month, t.priceId.year]),
      ...CREDIT_PACKS.map((p) => p.priceId),
    ];
    setPricesLoading(true);
    previewPrices(ids)
      .then((result) => {
        if (cancelled) return;
        setPrices(result);
        setPricesError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setPricesError(err instanceof Error ? err.message : "Couldn't load prices");
      })
      .finally(() => !cancelled && setPricesLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const priceFor = (id: string) => prices[id]?.formattedTotal;

  const handleSelect = (tier: Tier | null) => {
    if (!user) {
      navigate("/auth?next=/pricing");
      return;
    }
    if (!tier) {
      toast.success("You're on the Free plan!");
      return;
    }
    void startSubscription(interval, tier.key as PlanKey);
  };

  const handlePack = (key: string) => {
    if (!user) {
      navigate("/auth?next=/pricing");
      return;
    }
    void buyPack(key);
  };

  const PriceLine = ({ id, suffix }: { id: string; suffix: string }) => {
    if (pricesLoading) return <Skeleton className="h-10 w-32" />;
    const formatted = priceFor(id);
    if (!formatted) return <span className="text-sm text-muted-foreground">Price unavailable</span>;
    return (
      <div>
        <span className="text-4xl font-bold text-foreground">{formatted}</span>
        <span className="text-sm text-muted-foreground ml-1">/ {suffix}</span>
      </div>
    );
  };

  return (
    <div className="max-w-7xl mx-auto py-8 space-y-10">
      <div className="text-center space-y-3">
        <h1 className="text-4xl font-bold tracking-tight text-foreground">Choose your career edge</h1>
        <p className="text-muted-foreground max-w-xl mx-auto">
          Start free. Upgrade when you're ready to dominate your job search with full AI firepower.
        </p>
        <div className="inline-flex rounded-lg border border-border p-1 bg-card/50">
          {(["plans", "packs"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-1.5 text-sm rounded-md transition-colors ${
                tab === t ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t === "plans" ? "Subscriptions" : "Pay-per-use packs"}
            </button>
          ))}
        </div>
      </div>

      <PaymentsConfigBanner context="pricing" className="mx-auto max-w-3xl" />

      {pricesError && (
        <p className="text-center text-sm text-destructive">
          Couldn't load localized prices: {pricesError}
        </p>
      )}

      {tab === "plans" ? (
        <div className="space-y-8">
          <div className="flex justify-center">
            <div className="inline-flex items-center rounded-full border border-border bg-card/60 p-1">
              {(["monthly", "annual"] as const).map((i) => (
                <button
                  key={i}
                  onClick={() => setInterval(i)}
                  aria-pressed={interval === i}
                  className={`px-4 py-1.5 text-sm rounded-full transition-colors ${
                    interval === i
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {i === "monthly" ? "Monthly" : "Yearly"}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
            <Card className="relative p-6 flex flex-col border-border">
              <div className="flex items-center gap-2 mb-4">
                <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Sparkles className="h-4 w-4 text-primary" />
                </div>
                <h2 className="text-lg font-semibold text-foreground">{FREE_TIER.name}</h2>
              </div>
              <div className="mb-4">
                <span className="text-4xl font-bold text-foreground">$0</span>
                <span className="text-sm text-muted-foreground ml-1">/ forever</span>
              </div>
              <p className="text-sm text-muted-foreground mb-6">{FREE_TIER.description}</p>
              <ul className="space-y-2.5 mb-6 flex-1">
                {FREE_TIER.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-foreground">
                    <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => (currentPlan === "free" ? navigate("/dashboard") : handleSelect(null))}
              >
                {currentPlan === "free" ? "Current plan" : "Get started"}
              </Button>
            </Card>

            {TIERS.map((tier) => {
              const Icon = TIER_ICONS[tier.name] ?? Rocket;
              const priceId = interval === "annual" ? tier.priceId.year : tier.priceId.month;
              const pendingKey = `${tier.key}-${interval}`;
              const current = currentPlan === tier.key && billingInterval === interval;
              return (
                <Card
                  key={tier.name}
                  className={`relative p-6 flex flex-col ${
                    tier.highlighted ? "border-primary shadow-lg shadow-primary/10 xl:scale-[1.02]" : "border-border"
                  }`}
                >
                  {tier.highlighted && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-xs font-semibold px-3 py-1 rounded-full">
                      Most popular
                    </div>
                  )}

                  <div className="flex items-center gap-2 mb-4">
                    <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Icon className="h-4 w-4 text-primary" />
                    </div>
                    <h2 className="text-lg font-semibold text-foreground">{tier.name}</h2>
                  </div>

                  <div className="mb-4">
                    <PriceLine id={priceId} suffix={interval === "annual" ? "year" : "month"} />
                  </div>

                  <p className="text-sm text-muted-foreground mb-6">{tier.description}</p>

                  <ul className="space-y-2.5 mb-6 flex-1">
                    {tier.features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-sm text-foreground">
                        <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>

                  <Button
                    onClick={() => (current ? navigate("/billing") : handleSelect(tier))}
                    variant={tier.highlighted ? "default" : "outline"}
                    className="w-full"
                    disabled={pending === pendingKey || pricesLoading || !priceFor(priceId)}
                  >
                    {current ? (
                      "Current plan"
                    ) : pending === pendingKey ? (
                      <span className="inline-flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" /> Opening checkout…
                      </span>
                    ) : (
                      `Subscribe to ${tier.name}`
                    )}
                  </Button>
                </Card>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {CREDIT_PACKS.map((pack) => (
            <Card key={pack.priceId} className="p-5 flex flex-col">
              <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center mb-3">
                <Zap className="h-4 w-4 text-primary" />
              </div>
              <h2 className="text-sm font-semibold text-foreground">{pack.label}</h2>
              <p className="text-xs text-muted-foreground mt-1 mb-4 flex-1">{pack.blurb}</p>
              <div className="mb-4">
                {pricesLoading ? (
                  <Skeleton className="h-8 w-24" />
                ) : (
                  <span className="text-2xl font-bold text-foreground">
                    {priceFor(pack.priceId) ?? "—"}
                  </span>
                )}
              </div>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => handlePack(pack.priceId)}
                disabled={pending === pack.priceId}
              >
                {pending === pack.priceId ? "Opening checkout…" : "Buy pack"}
              </Button>
            </Card>
          ))}
        </div>
      )}

      <div className="space-y-2 text-center text-xs text-muted-foreground">
        <p>
          Prices shown in your local currency. Orders are processed by Paddle.com, our Merchant of
          Record. Cancel anytime from your billing page.
        </p>
        <p className="flex flex-wrap items-center justify-center gap-3">
          <Link to="/terms" className="underline hover:text-foreground">
            Terms &amp; Conditions
          </Link>
          <Link to="/refund-policy" className="underline hover:text-foreground">
            Refund Policy
          </Link>
          <Link to="/privacy" className="underline hover:text-foreground">
            Privacy Notice
          </Link>
        </p>
      </div>
    </div>
  );
}
