import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Mic, Radio, RefreshCw, Sparkles, Zap } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ds/Button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Seo } from "@/components/Seo";
import { PageHeader } from "@/components/app/PageHeader";
import { CREDIT_PACKS } from "@/config/tiers";
import {
  useBillingActions,
  useCredits,
  useEntitlements,
  usePurchases,
} from "@/hooks/useSubscription";
import { useRealtimeBilling } from "@/hooks/useRealtimeBilling";

function formatMoney(cents: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() })
    .format(cents / 100);
}

/** Monthly plan allowance for one feature, rendered as a usage bar. */
function AllowanceRow({
  label,
  used,
  allowance,
}: {
  label: string;
  used: number;
  allowance: number | null;
}) {
  const unlimited = allowance === null;
  const pct = unlimited || allowance === 0 ? 0 : Math.min(100, Math.round((used / allowance) * 100));
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="text-foreground">{label}</span>
        <span className="text-muted-foreground tabular-nums">
          {unlimited ? "Unlimited" : `${used} / ${allowance} used`}
        </span>
      </div>
      <Progress value={unlimited ? 100 : pct} aria-label="Credit usage" className="h-1.5" />
    </div>
  );
}

export default function Credits() {
  const navigate = useNavigate();
  useRealtimeBilling();

  const { data: credits, isLoading: creditsLoading, isFetching, refetch } = useCredits();
  const { data: entitlements, isLoading: entLoading } = useEntitlements();
  const { data: purchases } = usePurchases();
  const { pending, buyPack } = useBillingActions();

  const packLedger = useMemo(() => (purchases ?? []).slice(0, 10), [purchases]);

  const balances = [
    {
      key: "application",
      label: "Application credits",
      icon: Zap,
      tone: "text-primary",
      value: credits?.application_credits ?? 0,
      hint: "Spent when you generate a tailored application package.",
    },
    {
      key: "interview",
      label: "Interview prep credits",
      icon: Mic,
      tone: "text-mahogany",
      value: credits?.interview_credits ?? 0,
      hint: "Spent when you start an AI mock interview session.",
    },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Seo
        title="Credits & usage"
        description="Track your Gradr credit balance, monthly plan allowance and top-up history in real time."
        path="/credits"
      />

      <PageHeader
        title="Credits & usage"
        description="Your balance updates the moment a purchase or a run settles."
        actions={
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="gap-1.5 font-normal">
              <Radio className="h-3 w-3 text-primary" />
              Live
            </Badge>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => void refetch()}
              disabled={isFetching}
            >
              <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2">
        {balances.map((b) => (
          <Card key={b.key} className="p-5">
            <div className="flex items-center gap-2 mb-2">
              <b.icon className={`h-4 w-4 ${b.tone}`} />
              <span className="text-sm text-muted-foreground">{b.label}</span>
            </div>
            {creditsLoading ? (
              <Skeleton className="h-9 w-16" />
            ) : (
              <div className="type-h1 text-foreground tabular-nums">{b.value}</div>
            )}
            <p className="text-xs text-muted-foreground mt-2">{b.hint}</p>
          </Card>
        ))}
      </div>

      <Card className="p-6 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-sm font-semibold text-foreground">This month on your plan</h2>
          <Badge variant="secondary" className="capitalize">{entitlements?.tier ?? "free"}</Badge>
        </div>
        {entLoading || !entitlements ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <div className="space-y-4">
            <AllowanceRow
              label="Resume analyses"
              used={entitlements.features.resume.used}
              allowance={entitlements.features.resume.allowance}
            />
            <AllowanceRow
              label="Application packages"
              used={entitlements.features.application.used}
              allowance={entitlements.features.application.allowance}
            />
            <AllowanceRow
              label="Mock interview sessions"
              used={entitlements.features.interview.used}
              allowance={entitlements.features.interview.allowance}
            />
            <p className="text-xs text-muted-foreground">
              Plan allowance is used first each month. Purchased credits are only spent once the
              monthly allowance runs out.
            </p>
          </div>
        )}
      </Card>

      <Card className="p-6 space-y-4">
        <h2 className="text-sm font-semibold text-foreground">Top up</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {CREDIT_PACKS.map((pack) => (
            <div
              key={pack.priceId}
              className="flex items-center justify-between gap-3 rounded-lg border border-border p-4"
            >
              <div>
                <div className="text-sm text-foreground">{pack.label}</div>
                <div className="text-xs text-muted-foreground">{pack.blurb}</div>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void buyPack(pack.priceId)}
                disabled={pending === pack.priceId}
              >
                {pending === pack.priceId ? "Opening…" : "Buy"}
              </Button>
            </div>
          ))}
        </div>
        <Button variant="ghost" className="w-full gap-2" onClick={() => navigate("/pricing")}>
          <Sparkles className="h-4 w-4" />
          Compare plans instead
        </Button>
      </Card>

      <Card className="p-6">
        <h2 className="text-sm font-semibold text-foreground mb-4">Recent top-ups</h2>
        {packLedger.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No credit purchases yet. Packs you buy appear here instantly.
          </p>
        ) : (
          <div className="divide-y divide-border">
            {packLedger.map((p) => (
              <div key={p.id} className="py-3 flex items-center justify-between gap-4 text-sm">
                <div>
                  <div className="text-foreground">{p.pack_label ?? p.pack_key}</div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(p.created_at).toLocaleDateString()} · +{p.credits_granted} credits
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

      <p className="text-center text-xs text-muted-foreground pb-4">
        Invoices and subscription settings live on the{" "}
        <Link to="/billing" className="underline hover:text-foreground">Billing page</Link>.
      </p>
    </div>
  );
}
