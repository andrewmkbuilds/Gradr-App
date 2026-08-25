import { useQuery } from "@tanstack/react-query";
import { Activity, Coins, Gauge, RefreshCw, Users } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
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
import { AdminErrorState } from "@/components/admin/AdminErrorState";

interface UsagePayload {
  features: { feature: string; used: number; credits: number; users: number; estimatedCostCents: number }[];
  totalCalls: number;
  totalCreditsSpent: number;
  estimatedCostCents: number;
  activeUsers: number;
  series: { month: string; used: number }[];
}

const usd = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 })
    .format(cents / 100);

const prettyFeature = (f: string) => f.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

function Metric({ label, value, hint, icon: Icon }: { label: string; value: string; hint?: string; icon: typeof Gauge }) {
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

/** Feature consumption and the AI spend it implies, rolled up server-side. */
export default function AdminUsage() {
  const env = getPaddleEnvironment();

  const { data, isLoading, isFetching, refetch, error } = useQuery({
    queryKey: ["admin-usage", env],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("admin-metrics", {
        body: { scope: "usage", environment: env },
      });
      if (error) throw error;
      return (data as { usage: UsagePayload }).usage;
    },
  });

  const maxUsed = data?.features[0]?.used ?? 0;

  return (
    <div className="page-shell page-stack">
      <PageHeader
        eyebrow="Operations"
        icon={<Gauge className="h-3.5 w-3.5" aria-hidden="true" />}
        title="Usage & AI cost"
        description="What people actually run, who runs it, and what it costs to serve — last 90 days."
        meta={<Badge variant="secondary" className="uppercase tracking-wide">{env}</Badge>}
        actions={
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={cn("mr-2 h-4 w-4", isFetching && "animate-spin")} aria-hidden="true" />
            Refresh
          </Button>
        }
      />

      {error && (
        <AdminErrorState
          error={error}
          resource="usage metrics"
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
          <section aria-label="Usage metrics" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="AI runs" value={data.totalCalls.toLocaleString()} hint="metered feature calls" icon={Activity} />
            <Metric label="Active users" value={data.activeUsers.toLocaleString()} hint="with at least one run" icon={Users} />
            <Metric label="Credits spent" value={data.totalCreditsSpent.toLocaleString()} hint="pack + plan allowance" icon={Coins} />
            <Metric
              label="Estimated AI cost"
              value={usd(data.estimatedCostCents)}
              hint="modelled per-call estimate"
              icon={Gauge}
            />
          </section>

          <Card className="p-4">
            <h2 className={cn(typography.h4, "mb-3")}>Run volume over time</h2>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.series}>
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
                  <Line
                    type="monotone"
                    dataKey="used"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card className="p-4">
            <h2 className={cn(typography.h4, "mb-3")}>By feature</h2>
            {data.features.length === 0 ? (
              <p className="text-sm text-muted-foreground">No metered usage recorded in this window.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="py-2 pr-4 font-medium">Feature</th>
                      <th className="py-2 pr-4 font-medium">Share</th>
                      <th className="py-2 pr-4 text-right font-medium">Runs</th>
                      <th className="py-2 pr-4 text-right font-medium">Users</th>
                      <th className="py-2 pr-4 text-right font-medium">Credits</th>
                      <th className="py-2 text-right font-medium">Est. cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.features.map((f) => (
                      <tr key={f.feature} className="border-b last:border-0">
                        <td className="py-2 pr-4 text-foreground">{prettyFeature(f.feature)}</td>
                        <td className="py-2 pr-4">
                          <div className="h-2 w-32 rounded-full bg-muted">
                            <div
                              className="h-2 rounded-full bg-brand-secondary"
                              style={{ width: `${maxUsed ? (f.used / maxUsed) * 100 : 0}%` }}
                            />
                          </div>
                        </td>
                        <td className="py-2 pr-4 text-right tabular-nums">{f.used.toLocaleString()}</td>
                        <td className="py-2 pr-4 text-right tabular-nums">{f.users.toLocaleString()}</td>
                        <td className="py-2 pr-4 text-right tabular-nums">{f.credits.toLocaleString()}</td>
                        <td className="py-2 text-right tabular-nums">{usd(f.estimatedCostCents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="mt-3 text-xs text-muted-foreground">
              Cost is a modelled estimate per run type, not a provider invoice — use it for trend and ratio, not accounting.
            </p>
          </Card>
        </>
      ) : null}
    </div>
  );
}
