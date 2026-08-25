import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, RefreshCw, ShieldCheck, TrendingUp, Users, Wallet } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as ReTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/app/PageHeader";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ds/Button";
import { Skeleton } from "@/components/ui/skeleton";
import { getPaddleEnvironment } from "@/lib/paddle";
import { typography } from "@/lib/design/typography";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { AdminErrorState } from "@/components/admin/AdminErrorState";

interface RevenuePayload {
  activeCount: number;
  totalCustomers: number;
  mrrCents: number;
  arrCents: number;
  arpuCents: number;
  byTier: Record<string, number>;
  byInterval: Record<string, number>;
  pendingCancel: number;
  churnRiskPercent: number;
  atRisk: { userId: string; email: string; tier: string | null; status: string | null; periodEnd: string | null }[];
  signupSeries: { month: string; count: number }[];
  packRevenue: { key: string; label: string; count: number; cents: number }[];
  oneTimeRevenueCents: number;
}

const usd = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })
    .format(cents / 100);

function Metric({ label, value, hint, icon: Icon }: { label: string; value: string; hint?: string; icon: typeof Wallet }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4" aria-hidden="true" />
        <span className="text-xs uppercase tracking-[0.14em]">{label}</span>
      </div>
      <p className="mt-2 text-3xl font-semibold tabular-nums text-foreground">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </Card>
  );
}

/** Revenue health: recurring revenue, plan mix, and the payment-recovery queue. */
export default function AdminRevenue() {
  const env = getPaddleEnvironment();
  const [reconciling, setReconciling] = useState(false);

  /** Pull authoritative state from Paddle and repair any webhook drift. */
  const reconcile = async () => {
    setReconciling(true);
    try {
      const { data, error } = await supabase.functions.invoke("payments-reconcile", {
        body: { environment: env },
      });
      if (error) throw error;
      const repaired = (data as { repaired?: number })?.repaired ?? 0;
      toast.success(
        repaired > 0 ? `Reconciled ${repaired} subscription${repaired === 1 ? "" : "s"}` : "Everything already in sync",
      );
      refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Reconciliation failed");
    } finally {
      setReconciling(false);
    }
  };

  const { data, isLoading, isFetching, refetch, error } = useQuery({
    queryKey: ["admin-revenue", env],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("admin-metrics", {
        body: { scope: "revenue", environment: env },
      });
      if (error) throw error;
      return (data as { revenue: RevenuePayload }).revenue;
    },
  });

  return (
    <div className="page-shell page-stack">
      <PageHeader
        eyebrow="Operations"
        icon={<Wallet className="h-3.5 w-3.5" aria-hidden="true" />}
        title="Revenue"
        description="Recurring revenue, plan mix and the accounts that need a nudge."
        meta={<Badge variant="secondary" className="uppercase tracking-wide">{env}</Badge>}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={cn("mr-2 h-4 w-4", isFetching && "animate-spin")} aria-hidden="true" />
              Refresh
            </Button>
            <Button size="sm" onClick={reconcile} disabled={reconciling}>
              <ShieldCheck className="mr-2 h-4 w-4" aria-hidden="true" />
              {reconciling ? "Reconciling…" : "Reconcile with Paddle"}
            </Button>
          </div>
        }
      />

      {error && (
        <AdminErrorState
          error={error}
          resource="revenue metrics"
          onRetry={() => refetch()}
          isRetrying={isFetching}
        />
      )}

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
      ) : data ? (
        <>
          <section aria-label="Revenue metrics" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="MRR" value={usd(data.mrrCents)} hint={`${usd(data.arrCents)} annualized`} icon={Wallet} />
            <Metric label="Active subscribers" value={String(data.activeCount)} hint={`${data.totalCustomers} customers total`} icon={Users} />
            <Metric label="ARPU" value={usd(data.arpuCents)} hint="per active subscriber / month" icon={TrendingUp} />
            <Metric
              label="Churn risk"
              value={`${data.churnRiskPercent}%`}
              hint={`${data.pendingCancel} scheduled to cancel · ${data.atRisk.length} failing payment`}
              icon={AlertTriangle}
            />
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-4">
              <h2 className={cn(typography.h4, "mb-3")}>Plan mix</h2>
              <ul className="space-y-2">
                {Object.entries(data.byTier).map(([tier, count]) => {
                  const pct = data.activeCount ? Math.round((count / data.activeCount) * 100) : 0;
                  return (
                    <li key={tier}>
                      <div className="flex items-center justify-between text-sm">
                        <span className="capitalize text-foreground">{tier}</span>
                        <span className="tabular-nums text-muted-foreground">{count} · {pct}%</span>
                      </div>
                      <div className="mt-1 h-2 rounded-full bg-muted">
                        <div className="h-2 rounded-full bg-primary" style={{ width: `${pct}%` }} />
                      </div>
                    </li>
                  );
                })}
                {Object.keys(data.byTier).length === 0 && (
                  <li className="text-sm text-muted-foreground">No active subscriptions yet.</li>
                )}
              </ul>
              <p className="mt-4 text-xs text-muted-foreground">
                {data.byInterval.monthly} monthly · {data.byInterval.annual} annual
              </p>
            </Card>

            <Card className="p-4">
              <h2 className={cn(typography.h4, "mb-3")}>New paid subscriptions</h2>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.signupSeries}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <YAxis allowDecimals={false} stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <ReTooltip
                      contentStyle={{
                        background: "hsl(var(--popover))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 8,
                        color: "hsl(var(--popover-foreground))",
                      }}
                    />
                    <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          <Card className="p-4">
            <h2 className={cn(typography.h4, "mb-1")}>Payment recovery</h2>
            <p className="mb-3 text-sm text-muted-foreground">
              Subscriptions in <code>past_due</code> or <code>unpaid</code>. Dunning emails go out automatically;
              this list is for manual follow-up.
            </p>
            {data.atRisk.length === 0 ? (
              <p className="text-sm text-success">No failing payments. </p>
            ) : (
              <div tabIndex={0} role="group" aria-label="Revenue table" className="overflow-x-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="py-2 pr-4 font-medium">Email</th>
                      <th className="py-2 pr-4 font-medium">Tier</th>
                      <th className="py-2 pr-4 font-medium">Status</th>
                      <th className="py-2 font-medium">Period end</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.atRisk.map((r) => (
                      <tr key={r.userId} className="border-b last:border-0">
                        <td className="py-2 pr-4">{r.email}</td>
                        <td className="py-2 pr-4 capitalize">{r.tier ?? "—"}</td>
                        <td className="py-2 pr-4">
                          <Badge variant="destructive">{r.status}</Badge>
                        </td>
                        <td className="py-2 tabular-nums text-muted-foreground">
                          {r.periodEnd ? new Date(r.periodEnd).toLocaleDateString() : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card className="p-4">
            <h2 className={cn(typography.h4, "mb-1")}>Credit packs (90 days)</h2>
            <p className="mb-3 text-sm text-muted-foreground">
              One-time revenue: <span className="font-medium text-foreground">{usd(data.oneTimeRevenueCents)}</span>
            </p>
            {data.packRevenue.length === 0 ? (
              <p className="text-sm text-muted-foreground">No pack purchases in this window.</p>
            ) : (
              <ul className="divide-y">
                {data.packRevenue.map((p) => (
                  <li key={p.key} className="flex items-center justify-between py-2 text-sm">
                    <span className="text-foreground">{p.label}</span>
                    <span className="tabular-nums text-muted-foreground">{p.count} × · {usd(p.cents)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      ) : null}
    </div>
  );
}
