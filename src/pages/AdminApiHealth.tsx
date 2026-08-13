import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import WebhookReplayPanel from "@/components/admin/WebhookReplayPanel";

interface HealthEvent {
  id: string;
  endpoint: string;
  method: string;
  status_code: number;
  outcome: string;
  duration_ms: number;
  error_message: string | null;
  created_at: string;
}

interface HealthAlert {
  id: string;
  endpoint: string;
  kind: string;
  message: string;
  occurrences: number;
  first_seen_at: string;
  last_seen_at: string;
}

const WINDOW_HOURS = 24;

const OUTCOME_LABEL: Record<string, string> = {
  success: "Healthy",
  auth_rejected: "Auth rejected",
  rate_limited: "Rate limited",
  client_error: "Client error",
  server_error: "Failing",
};

function outcomeTone(outcome: string) {
  if (outcome === "success") return "text-success";
  if (outcome === "server_error") return "text-destructive";
  return "text-warning";
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

/** Admin-only health board for the in-app `/api/public/*` backend. */
export default function AdminApiHealth() {
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const since = useMemo(
    () => new Date(Date.now() - WINDOW_HOURS * 3600_000).toISOString(),
    [],
  );

  const events = useQuery({
    queryKey: ["api-health-events"],
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("api_health_events")
        .select("*")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as unknown as HealthEvent[];
    },
  });

  const alerts = useQuery({
    queryKey: ["api-health-alerts"],
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("api_health_alerts")
        .select("*")
        .eq("resolved", false)
        .order("last_seen_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as HealthAlert[];
    },
  });

  const resolve = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("api_health_alerts")
        .update({ resolved: true, resolved_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Alert resolved");
      queryClient.invalidateQueries({ queryKey: ["api-health-alerts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = useMemo(() => {
    const map = new Map<
      string,
      { endpoint: string; total: number; failures: number; auth: number; latency: number; last: string }
    >();
    for (const e of events.data ?? []) {
      const row = map.get(e.endpoint) ?? {
        endpoint: e.endpoint,
        total: 0,
        failures: 0,
        auth: 0,
        latency: 0,
        last: e.created_at,
      };
      row.total += 1;
      if (e.outcome === "server_error") row.failures += 1;
      if (e.outcome === "auth_rejected") row.auth += 1;
      row.latency += e.duration_ms;
      map.set(e.endpoint, row);
    }
    return [...map.values()].sort((a, b) => b.failures - a.failures || b.total - a.total);
  }, [events.data]);

  const recentFailures = (events.data ?? [])
    .filter((e) => e.outcome === "server_error" || e.outcome === "auth_rejected")
    .slice(0, 20);

  const refreshAll = async () => {
    setRefreshing(true);
    await Promise.all([events.refetch(), alerts.refetch()]);
    setRefreshing(false);
  };

  const totals = rows.reduce(
    (acc, r) => ({
      calls: acc.calls + r.total,
      failures: acc.failures + r.failures,
      auth: acc.auth + r.auth,
    }),
    { calls: 0, failures: 0, auth: 0 },
  );

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-4 md:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">API Health</h1>
          <p className="text-sm text-muted-foreground">
            Live status of every in-app endpoint over the last {WINDOW_HOURS} hours.
          </p>
        </div>
        <Button variant="outline" onClick={refreshAll} disabled={refreshing}>
          {refreshing ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          Refresh
        </Button>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "Requests", value: totals.calls, icon: Activity, tone: "text-primary" },
          { label: "Failures", value: totals.failures, icon: AlertTriangle, tone: "text-destructive" },
          { label: "Auth rejections", value: totals.auth, icon: ShieldAlert, tone: "text-warning" },
        ].map((s) => (
          <Card key={s.label} className="flex items-center gap-3 p-4">
            <s.icon className={`h-5 w-5 ${s.tone}`} aria-hidden="true" />
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{s.label}</p>
              <p className="text-2xl font-semibold text-foreground">{s.value}</p>
            </div>
          </Card>
        ))}
      </div>

      <Card className="p-4">
        <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-foreground">
          <AlertTriangle className="h-4 w-4 text-warning" aria-hidden="true" /> Open alerts
        </h2>
        {alerts.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (alerts.data ?? []).length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />
            No open alerts — every endpoint is responding normally.
          </p>
        ) : (
          <ul className="divide-y divide-border/60">
            {(alerts.data ?? []).map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-3 py-3">
                <Badge variant="outline" className={outcomeTone(a.kind)}>
                  {OUTCOME_LABEL[a.kind] ?? a.kind}
                </Badge>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{a.endpoint}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {a.message} · {a.occurrences}× · last {timeAgo(a.last_seen_at)}
                  </p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => resolve.mutate(a.id)}>
                  Resolve
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-4">
        <h2 className="mb-3 text-base font-semibold text-foreground">Endpoints</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="py-2">Endpoint</th>
                <th className="py-2">Calls</th>
                <th className="py-2">Failures</th>
                <th className="py-2">Auth rejected</th>
                <th className="py-2">Avg latency</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-4 text-muted-foreground">
                    No traffic recorded in this window yet.
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.endpoint} className="border-t border-border/60">
                  <td className="py-2 font-medium text-foreground">{r.endpoint}</td>
                  <td className="py-2">{r.total}</td>
                  <td className={`py-2 ${r.failures ? "text-destructive" : ""}`}>{r.failures}</td>
                  <td className={`py-2 ${r.auth ? "text-warning" : ""}`}>{r.auth}</td>
                  <td className="py-2">{Math.round(r.latency / Math.max(1, r.total))} ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-4">
        <h2 className="mb-3 text-base font-semibold text-foreground">Recent failures & rejections</h2>
        {recentFailures.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing to show — clean window.</p>
        ) : (
          <ul className="divide-y divide-border/60">
            {recentFailures.map((e) => (
              <li key={e.id} className="py-2">
                <p className="text-sm text-foreground">
                  <span className={outcomeTone(e.outcome)}>{e.status_code}</span> {e.method}{" "}
                  {e.endpoint}
                  <span className="text-muted-foreground"> · {timeAgo(e.created_at)}</span>
                </p>
                {e.error_message && (
                  <p className="truncate text-xs text-muted-foreground">{e.error_message}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <WebhookReplayPanel />
    </div>
  );
}
