import { useEffect } from "react";
import { CreditCard, RefreshCw, Zap, Mic, ExternalLink, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useBillingActions, useCredits, usePurchases, useSubscription } from "@/hooks/useSubscription";
import { Seo } from "@/components/Seo";

function formatMoney(cents: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() })
    .format(cents / 100);
}

export default function Billing() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const sub = useSubscription();
  const { data: credits } = useCredits();
  const { data: purchases } = usePurchases();
  const { pending, openPortal, restorePurchases } = useBillingActions();

  useEffect(() => {
    if (params.get("checkout") === "success" || params.get("purchase") === "success") {
      toast.success("Payment complete — syncing your account…");
      void restorePurchases();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const renews = sub.currentPeriodEnd
    ? new Date(sub.currentPeriodEnd).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : null;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Seo
        title="Billing & Subscription"
        description="Manage your CareerFlow OS subscription, credits and purchase history."
        path="/billing"
      />

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Billing</h1>
          <p className="text-sm text-muted-foreground">Manage your plan, credits and payment history.</p>
        </div>
        <Button variant="outline" size="sm" className="gap-2" onClick={() => void restorePurchases()} disabled={pending === "restore"}>
          <RefreshCw className={`h-4 w-4 ${pending === "restore" ? "animate-spin" : ""}`} />
          Restore purchases
        </Button>
      </div>

      <Card className="p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold text-foreground">Current plan</h2>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold text-foreground">
                {sub.isPro ? `CareerFlow OS Pro (${sub.billingInterval === "annual" ? "Annual" : "Monthly"})` : "Starter (Free)"}
              </span>
              {sub.status && sub.status !== "none" && (
                <Badge variant={sub.isPro ? "default" : "secondary"}>{sub.status}</Badge>
              )}
            </div>
            {sub.isPro && renews && (
              <p className="text-sm text-muted-foreground">
                {sub.cancelAtPeriodEnd ? `Cancels on ${renews}` : `Renews on ${renews}`}
              </p>
            )}
            {!sub.isPro && (
              <p className="text-sm text-muted-foreground">Upgrade to unlock unlimited AI analysis and coaching.</p>
            )}
          </div>

          <div className="flex gap-2">
            {sub.isPro ? (
              <Button className="gap-2" onClick={() => void openPortal()} disabled={pending === "portal"}>
                <ExternalLink className="h-4 w-4" />
                Manage subscription
              </Button>
            ) : (
              <Button className="gap-2" onClick={() => navigate("/pricing")}>
                <Sparkles className="h-4 w-4" />
                Upgrade to Pro
              </Button>
            )}
          </div>
        </div>
        {sub.isPro && (
          <p className="text-xs text-muted-foreground mt-4">
            Switch between monthly and annual billing, update your card, or cancel from the Stripe customer portal.
          </p>
        )}
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="h-4 w-4 text-primary" />
            <span className="text-sm text-muted-foreground">Application credits</span>
          </div>
          <div className="text-3xl font-bold text-foreground">{credits?.application_credits ?? 0}</div>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-2">
            <Mic className="h-4 w-4 text-primary" />
            <span className="text-sm text-muted-foreground">Interview prep credits</span>
          </div>
          <div className="text-3xl font-bold text-foreground">{credits?.interview_credits ?? 0}</div>
        </Card>
      </div>

      <Card className="p-6">
        <h2 className="text-sm font-semibold text-foreground mb-4">Purchase history</h2>
        {!purchases || purchases.length === 0 ? (
          <p className="text-sm text-muted-foreground">No pack purchases yet.</p>
        ) : (
          <div className="divide-y divide-border">
            {purchases.map((p) => (
              <div key={p.id} className="py-3 flex items-center justify-between gap-4 text-sm">
                <div>
                  <div className="text-foreground">{p.pack_label ?? p.pack_key}</div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(p.created_at).toLocaleDateString()} · {p.credits_granted} credits
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-foreground">{formatMoney(p.amount_total, p.currency)}</span>
                  <Badge variant={p.status === "paid" ? "default" : "secondary"}>{p.status}</Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Button variant="ghost" className="w-full" onClick={() => navigate("/pricing")}>
        Browse plans and pay-per-use packs
      </Button>
    </div>
  );
}
