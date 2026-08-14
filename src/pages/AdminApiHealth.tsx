import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, Download, RefreshCw, Timer, TriangleAlert } from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { format, formatDistanceToNow, subHours } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/app/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { downloadCsvWithManifest } from "@/lib/admin/auditManifest";
import { cn } from "@/lib/utils";

/**
 * API health — availability, latency and rate-limit/backoff pressure for every
 * outbound provider Gradr depends on.
 */

interface HealthEvent {
  id: string;
  provider: string;
  endpoint: string;
  method: string;
  status_code: number | null;
  outcome: string | null;
  duration_ms: number | null;
  rate_limited: boolean;
  retry_after_ms: number | null;
  attempt: number;
  error_message: string | null;
  environment: string | null;
  created_at: string;
}

const COLUMNS: (keyof HealthEvent)[] = [
  "created_at", "provider", "endpoint", "method", "status_code", "outcome",
  "duration_ms", "rate_limited", "retry_after_ms", "attempt", "error_message", "environment", "id",
];

const WINDOWS = [
  { value: "6", label: "Last 6 hours" },
  { value: "24", label: "Last 24 hours" },
  { value: "72", label: "Last 3 days" },
  { value: "168", label: "Last 7 days" },
];

function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return Math.round(sorted[idx]);
}

function Stat({ label, value, hint, tone = "neutral", loading }: {
  label: string; value: string | number; hint?: string;
  tone?: "neutral" | "good" | "warn" | "bad"; loading?: boolean;
}) {
  const toneClass = { neutral: "text-foreground", good: "text-success", warn: "text-warning", bad: "text-destructive" }[tone];
  return (
    <Card className="p-4">
      <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      {loading ? <Skeleton className="mt-2 h-8 w-20" /> : (
        <p className={cn("mt-1 text-3xl font-semibold tabular-nums", toneClass)}>{value}</p>
      )}
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </Card>
  );
}

export default function AdminApiHealth() {
  const { user } = useAuth();
  const [hours, setHours] = useState("24");
  const [provider, setProvider] = useState("all");
  const [exporting, setExporting] = useState(false);

  const since = useMemo(() => subHours(new Date(), Number(hours)).toISOString(), [hours]);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["admin-api-health", hours],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("api_health_events")
        .select("id, provider, endpoint, method, status_code, outcome, duration_ms, rate_limited, retry_after_ms, attempt, error_message, environment, created_at")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(2000);
      if (error) throw error;
      return (data ?? []) as unknown as HealthEvent[];
    },
  });

  const events = useMemo(
    () => (data ?? []).filter((e) => provider === "all" || e.provider === provider),
    [data, provider],
  );

  const providers = useMemo(
    () => Array.from(new Set((data ?? []).map((e) => e.provider))).sort(),
    [data],
  );

  const summary = useMemo(() => {
    const total = events.length;
    const failed = events.filter((e) => e.outcome !== "success").length;
    const limited = events.filter((e) => e.rate_limited).length;
    const latencies = events.map((e) => e.duration_ms ?? 0).filter(Boolean);
    return {
      total,
      successRate: total ? Math.round(((total - failed) / total) * 100) : 100,
      limited,
      p50: percentile(latencies, 50),
      p95: percentile(latencies, 95),
      maxBackoff: Math.max(0, ...events.map((e) => e.retry_after_ms ?? 0)),
    };
  }, [events]);

  /** Bucket by hour for the availability + backoff charts. */
  const series = useMemo(() => {
    const buckets = new Map<string, { t: string; ok: number; failed: number; limited: number; p95: number; latencies: number[] }>();
    for (const e of events) {
      const key = format(new Date(e.created_at), "MMM d HH:00");
      const b = buckets.get(key) ?? { t: key, ok: 0, failed: 0, limited: 0, p95: 0, latencies: [] };
      if (e.outcome === "success") b.ok += 1; else b.failed += 1;
      if (e.rate_limited) b.limited += 1;
      if (e.duration_ms) b.latencies.push(e.duration_ms);
      buckets.set(key, b);
    }
    return Array.from(buckets.values())
      .map((b) => ({ ...b, p95: percentile(b.latencies, 95) }))
      .reverse();
  }, [events]);

  const byProvider = useMemo(() => {
    const map = new Map<string, { provider: string; calls: number; failures: number; limited: number; latencies: number[] }>();
    for (const e of events) {
      const row = map.get(e.provider) ?? { provider: e.provider, calls: 0, failures: 0, limited: 0, latencies: [] };
      row.calls += 1;
      if (e.outcome !== "success") row.failures += 1;
      if (e.rate_limited) row.limited += 1;
      if (e.duration_ms) row.latencies.push(e.duration_ms);
      map.set(e.provider, row);
    }
    return Array.from(map.values())
      .map((r) => ({
        ...r,
        p95: percentile(r.latencies, 95),
        successRate: r.calls ? Math.round(((r.calls - r.failures) / r.calls) * 100) : 100,
      }))
      .sort((a, b) => b.calls - a.calls);
  }, [events]);

  const onExport = async () => {
    if (!events.length) {
      toast.error("Nothing to export in this window.");
      return;
    }
    setExporting(true);
    try {
      const manifest = await downloadCsvWithManifest({
        basename: `gradr-api-health-${format(new Date(), "yyyyMMdd-HHmm")}`,
        dataset: "api_health_events",
        rows: events as unknown as Record<string, unknown>[],
        columns: COLUMNS as string[],
        exportedBy: user?.email ?? user?.id ?? "unknown-admin",
        filters: { window_hours: Number(hours), provider, since },
      });
      toast.success(`Exported ${manifest.row_count} events`, {
        description: `SHA-256 ${manifest.sha256.slice(0, 16)}… (manifest downloaded)`,
      });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 pb-16 pt-6 sm:px-6">
      <PageHeader
        eyebrow="Operations"
        title="API health"
        description="Availability, latency and rate-limit pressure across every provider Gradr calls."
        icon={Activity}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Select value={hours} onValueChange={setHours}>
          <SelectTrigger className="w-44" aria-label="Time window"><SelectValue /></SelectTrigger>
          <SelectContent>
            {WINDOWS.map((w) => <SelectItem key={w.value} value={w.value}>{w.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={provider} onValueChange={setProvider}>
          <SelectTrigger className="w-48" aria-label="Provider"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All providers</SelectItem>
            {providers.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={cn("mr-2 h-4 w-4", isFetching && "animate-spin")} aria-hidden="true" /> Refresh
        </Button>
        <Button onClick={onExport} disabled={exporting}>
          <Download className="mr-2 h-4 w-4" aria-hidden="true" /> Export CSV + manifest
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Calls" value={summary.total} hint="Recorded attempts in window" loading={isLoading} />
        <Stat
          label="Success rate"
          value={`${summary.successRate}%`}
          tone={summary.successRate >= 99 ? "good" : summary.successRate >= 95 ? "warn" : "bad"}
          loading={isLoading}
        />
        <Stat label="p95 latency" value={`${summary.p95} ms`} hint={`p50 ${summary.p50} ms`} loading={isLoading} />
        <Stat
          label="Rate limited"
          value={summary.limited}
          tone={summary.limited ? "warn" : "good"}
          hint={summary.maxBackoff ? `Max backoff ${Math.round(summary.maxBackoff / 1000)}s` : "No backoff requested"}
          loading={isLoading}
        />
      </div>

      <Card className="p-4">
        <h2 className="text-sm font-semibold">Outcomes over time</h2>
        <div className="mt-3 h-64">
          {isLoading ? <Skeleton className="h-full w-full" /> : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="t" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                <Legend />
                <Area type="monotone" dataKey="ok" name="Success" stackId="1" stroke="hsl(var(--primary))" fill="hsl(var(--primary) / 0.25)" />
                <Area type="monotone" dataKey="failed" name="Failed" stackId="1" stroke="hsl(var(--destructive))" fill="hsl(var(--destructive) / 0.25)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <TriangleAlert className="h-4 w-4 text-warning" aria-hidden="true" /> Rate limits &amp; backoff
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">429 responses per hour — the pressure signal before an outage.</p>
          <div className="mt-3 h-56">
            {isLoading ? <Skeleton className="h-full w-full" /> : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={series}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="t" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                  <Bar dataKey="limited" name="Rate limited" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card className="p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Timer className="h-4 w-4 text-primary" aria-hidden="true" /> p95 latency
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">Slowest tenth of calls, hour by hour.</p>
          <div className="mt-3 h-56">
            {isLoading ? <Skeleton className="h-full w-full" /> : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={series}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="t" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" unit="ms" />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                  <Area type="monotone" dataKey="p95" name="p95 (ms)" stroke="hsl(var(--primary))" fill="hsl(var(--primary) / 0.2)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="border-b border-border p-4">
          <h2 className="text-sm font-semibold">Per-provider breakdown</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">Provider health summary for the selected window</caption>
            <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-2 text-left font-medium">Provider</th>
                <th scope="col" className="px-4 py-2 text-right font-medium">Calls</th>
                <th scope="col" className="px-4 py-2 text-right font-medium">Success</th>
                <th scope="col" className="px-4 py-2 text-right font-medium">p95</th>
                <th scope="col" className="px-4 py-2 text-right font-medium">429s</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={5} className="px-4 py-6"><Skeleton className="h-6 w-full" /></td></tr>
              )}
              {!isLoading && byProvider.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No provider calls recorded in this window.</td></tr>
              )}
              {byProvider.map((r) => (
                <tr key={r.provider} className="border-t border-border/60">
                  <td className="px-4 py-2 font-medium">{r.provider}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{r.calls}</td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    <Badge variant={r.successRate >= 99 ? "secondary" : "destructive"}>{r.successRate}%</Badge>
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{r.p95} ms</td>
                  <td className="px-4 py-2 text-right tabular-nums">{r.limited}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b border-border p-4">
          <h2 className="text-sm font-semibold">Recent failures</h2>
        </div>
        <ul className="divide-y divide-border/60">
          {events.filter((e) => e.outcome !== "success").slice(0, 25).map((e) => (
            <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
              <div className="min-w-0">
                <p className="truncate font-medium">{e.provider} · {e.endpoint}</p>
                <p className="text-xs text-muted-foreground">
                  {e.error_message ?? e.outcome} · attempt {e.attempt}
                  {e.retry_after_ms ? ` · retry-after ${Math.round(e.retry_after_ms / 1000)}s` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {e.rate_limited && <Badge variant="outline">429</Badge>}
                {e.status_code && <Badge variant="destructive">{e.status_code}</Badge>}
                <span className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(e.created_at), { addSuffix: true })}</span>
              </div>
            </li>
          ))}
          {!isLoading && events.every((e) => e.outcome === "success") && (
            <li className="px-4 py-8 text-center text-sm text-muted-foreground">No failures in this window.</li>
          )}
        </ul>
      </Card>
    </div>
  );
}
