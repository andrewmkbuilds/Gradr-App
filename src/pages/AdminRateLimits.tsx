import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, Download, Gauge, ShieldAlert, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { downloadCsv } from "@/lib/exportFile";
import { listPolicies, DEFAULT_POLICY } from "@/lib/edge/shared/endpointPolicy";

interface HealthEvent {
  endpoint: string;
  status_code: number;
  outcome: string;
  created_at: string;
}

function describeBackoff(base: number | undefined, max: number | undefined) {
  if (!base) return "none";
  return `${base}s → ${max ?? base}s (x2 per strike)`;
}

/**
 * Read-only view of the per-endpoint reliability policy alongside the throttle
 * and error traffic each endpoint actually saw, so limits can be tuned against
 * evidence rather than guesswork.
 */
export default function AdminRateLimits() {
  const [days, setDays] = useState(7);
  const policies = useMemo(() => listPolicies(), []);
  const since = useMemo(
    () => new Date(Date.now() - days * 864e5).toISOString(),
    [days],
  );

  const traffic = useQuery({
    queryKey: ["rate-limit-traffic", since],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("api_health_events")
        .select("endpoint, status_code, outcome, created_at")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(5000);
      if (error) throw error;
      return (data ?? []) as unknown as HealthEvent[];
    },
  });

  const stats = useMemo(() => {
    const acc: Record<string, { total: number; throttled: number; errors: number; last: string }> = {};
    for (const e of traffic.data ?? []) {
      const row = (acc[e.endpoint] ??= { total: 0, throttled: 0, errors: 0, last: e.created_at });
      row.total += 1;
      if (e.status_code === 429) row.throttled += 1;
      if (e.status_code >= 500) row.errors += 1;
      if (e.created_at > row.last) row.last = e.created_at;
    }
    return acc;
  }, [traffic.data]);

  const rows = useMemo(() => {
    const known = new Set(policies.map((p) => p.endpoint));
    const extras = Object.keys(stats)
      .filter((e) => !known.has(e))
      .map((endpoint) => ({ endpoint, policy: DEFAULT_POLICY }));
    return [...policies, ...extras].sort((a, b) => {
      const at = stats[a.endpoint]?.throttled ?? 0;
      const bt = stats[b.endpoint]?.throttled ?? 0;
      if (at !== bt) return bt - at;
      return a.endpoint.localeCompare(b.endpoint);
    });
  }, [policies, stats]);

  const totalThrottled = Object.values(stats).reduce((n, s) => n + s.throttled, 0);

  const exportCsv = () =>
    downloadCsv(
      `rate-limit-policies-${new Date().toISOString().slice(0, 10)}.csv`,
      rows.map(({ endpoint, policy }) => ({
        endpoint,
        limit: policy.rateLimit === false ? "unlimited" : policy.rateLimit.limit,
        window_seconds:
          policy.rateLimit === false ? "" : Math.round(policy.rateLimit.windowMs / 1000),
        backoff:
          policy.rateLimit === false
            ? ""
            : describeBackoff(policy.rateLimit.backoffSeconds, policy.rateLimit.maxBackoffSeconds),
        alert_server_error: policy.alertAfter.server_error ?? "",
        alert_rate_limited: policy.alertAfter.rate_limited ?? "",
        requests: stats[endpoint]?.total ?? 0,
        throttled: stats[endpoint]?.throttled ?? 0,
        server_errors: stats[endpoint]?.errors ?? 0,
        window_days: days,
        exported_at: new Date().toISOString(),
      })),
      [
        "endpoint",
        "limit",
        "window_seconds",
        "backoff",
        "alert_server_error",
        "alert_rate_limited",
        "requests",
        "throttled",
        "server_errors",
        "window_days",
        "exported_at",
      ],
    );

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-4 md:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Rate limits &amp; backoff
          </h1>
          <p className="text-sm text-muted-foreground">
            Live policy per endpoint, next to the throttling it actually produced.
          </p>
        </div>
        <div className="flex items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="window-days">Window (days)</Label>
            <Input
              id="window-days"
              type="number"
              min={1}
              max={90}
              value={days}
              onChange={(e) => setDays(Math.min(90, Math.max(1, Number(e.target.value) || 7)))}
              className="w-28"
            />
          </div>
          <Button variant="outline" onClick={exportCsv}>
            <Download className="mr-2 h-4 w-4" aria-hidden="true" /> Export CSV
          </Button>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <Gauge className="mb-2 h-4 w-4 text-primary" aria-hidden="true" />
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Configured endpoints</p>
          <p className="text-2xl font-semibold text-foreground">{policies.length}</p>
        </Card>
        <Card className="p-4">
          <ShieldAlert className="mb-2 h-4 w-4 text-warning" aria-hidden="true" />
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Throttled requests</p>
          <p className="text-2xl font-semibold text-foreground">{totalThrottled}</p>
        </Card>
        <Card className="p-4">
          <Activity className="mb-2 h-4 w-4 text-success" aria-hidden="true" />
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Sampled requests</p>
          <p className="text-2xl font-semibold text-foreground">{traffic.data?.length ?? 0}</p>
        </Card>
      </div>

      <Card className="p-4">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="py-2">Endpoint</th>
                <th className="py-2">Limit</th>
                <th className="py-2">Backoff</th>
                <th className="py-2">Alert after</th>
                <th className="py-2 text-right">Requests</th>
                <th className="py-2 text-right">Throttled</th>
                <th className="py-2 text-right">5xx</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ endpoint, policy }) => {
                const s = stats[endpoint];
                const rule = policy.rateLimit;
                return (
                  <tr key={endpoint} className="border-t border-border/60">
                    <td className="py-2 font-medium text-foreground">{endpoint}</td>
                    <td className="py-2">
                      {rule === false ? (
                        <Badge variant="outline">unlimited</Badge>
                      ) : (
                        <span className="whitespace-nowrap">
                          {rule.limit} / {Math.round(rule.windowMs / 1000)}s
                        </span>
                      )}
                    </td>
                    <td className="py-2 whitespace-nowrap text-muted-foreground">
                      <Timer className="mr-1 inline h-3 w-3" aria-hidden="true" />
                      {rule === false
                        ? "—"
                        : describeBackoff(rule.backoffSeconds, rule.maxBackoffSeconds)}
                    </td>
                    <td className="py-2 text-xs text-muted-foreground">
                      5xx ×{policy.alertAfter.server_error ?? "—"} · 429 ×
                      {policy.alertAfter.rate_limited ?? "—"}
                    </td>
                    <td className="py-2 text-right">{s?.total ?? 0}</td>
                    <td
                      className={`py-2 text-right ${(s?.throttled ?? 0) > 0 ? "text-warning" : ""}`}
                    >
                      {s?.throttled ?? 0}
                    </td>
                    <td className={`py-2 text-right ${(s?.errors ?? 0) > 0 ? "text-destructive" : ""}`}>
                      {s?.errors ?? 0}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Endpoints not listed in the policy table use the default bucket (60 requests / 60s, 5s
          backoff). Sustained throttling on an endpoint usually means its bucket is too tight for
          normal page behaviour rather than abuse.
        </p>
      </Card>
    </div>
  );
}
