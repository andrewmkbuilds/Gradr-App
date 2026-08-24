import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, AlertTriangle, BellRing, CheckCircle2, Clock, Copy, RefreshCw } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/app/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ds/Button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

/**
 * Conversion-tracking health.
 *
 * Growth decisions are made from `payment_completed`, `subscription_created`
 * and `upgraded_to_premium`. This page shows whether those events actually
 * reached PostHog — once each, promptly — and surfaces the regressions the
 * scheduled detector files.
 */

interface EventHealth {
  event: string;
  ok: number;
  failed: number;
  skipped: number;
  duplicates: number;
  maxLatencyMs: number;
  lastSeen: string | null;
  lastError: string | null;
}

interface AlertRow {
  id: string;
  kind: string;
  severity: "info" | "warning" | "critical";
  event_name: string | null;
  detail: Record<string, unknown>;
  window_start: string;
  window_end: string;
  notified_at: string | null;
  created_at: string;
}

interface MonitorReport {
  status: "healthy" | "degraded" | "critical";
  window_hours: number;
  scanned_alerts: number | null;
  notified_admins: number;
  billing: { subscription_webhooks: number; unprocessed_webhooks: number };
  events: EventHealth[];
  critical_events: string[];
  alerts: AlertRow[];
}

const KIND_COPY: Record<string, string> = {
  capture_failed: "Events were rejected by PostHog",
  duplicate_event: "The same conversion was counted twice",
  delayed_event: "Events arrived too slowly for real-time funnels",
  webhook_unprocessed: "Payment webhooks never finished processing",
  missing_event: "Paid conversions produced no analytics event",
};

function StatusPill({ status }: { status: MonitorReport["status"] }) {
  const map = {
    healthy: { label: "Healthy", className: "bg-primary/10 text-primary", Icon: CheckCircle2 },
    degraded: { label: "Degraded", className: "bg-warning/10 text-warning", Icon: Clock },
    critical: { label: "Critical", className: "bg-destructive/10 text-destructive", Icon: AlertTriangle },
  }[status];
  return (
    <span className={cn("inline-flex items-center gap-2 rounded-full px-3 py-1 text-body-sm font-medium", map.className)}>
      <map.Icon className="h-4 w-4" aria-hidden />
      {map.label}
    </span>
  );
}

export default function AdminAnalyticsHealth() {
  const [hours, setHours] = useState("24");
  const queryClient = useQueryClient();

  const report = useQuery({
    queryKey: ["analytics-health", hours],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("analytics-monitor", {
        body: { action: "report", hours: Number(hours) },
      });
      if (error) throw error;
      return data as MonitorReport;
    },
    refetchInterval: 60_000,
  });

  const scan = useMutation({
    mutationFn: async (action: "scan" | "notify") => {
      const { data, error } = await supabase.functions.invoke("analytics-monitor", {
        body: { action, hours: Number(hours) },
      });
      if (error) throw error;
      return data as MonitorReport;
    },
    onSuccess: (data, action) => {
      queryClient.setQueryData(["analytics-health", hours], data);
      toast.success(
        action === "notify"
          ? `Scan complete — ${data.notified_admins} admin(s) notified`
          : `Scan complete — ${data.alerts.length} open alert(s)`,
      );
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const resolve = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("analytics_alerts")
        .update({ resolved_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Alert resolved");
      queryClient.invalidateQueries({ queryKey: ["analytics-health"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const data = report.data;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Conversion tracking health"
        description="Are payment_completed, subscription_created and upgraded_to_premium reaching PostHog — once each, on time?"
      />

      <Card className="flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="flex items-center gap-4">
          {report.isLoading ? <Skeleton className="h-8 w-28" /> : data ? <StatusPill status={data.status} /> : null}
          {data ? (
            <p className="text-body-sm text-muted-foreground">
              {data.billing.subscription_webhooks} subscription webhook(s),{" "}
              {data.billing.unprocessed_webhooks} unprocessed, in the last {data.window_hours}h
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={hours} onValueChange={setHours}>
            <SelectTrigger className="w-32" aria-label="Time window">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">Last hour</SelectItem>
              <SelectItem value="24">Last 24h</SelectItem>
              <SelectItem value="168">Last 7 days</SelectItem>
              <SelectItem value="720">Last 30 days</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={() => report.refetch()} disabled={report.isFetching}>
            <RefreshCw className={cn("mr-2 h-4 w-4", report.isFetching && "animate-spin")} aria-hidden />
            Refresh
          </Button>
          <Button variant="outline" onClick={() => scan.mutate("scan")} disabled={scan.isPending}>
            <Activity className="mr-2 h-4 w-4" aria-hidden />
            Run check now
          </Button>
          <Button onClick={() => scan.mutate("notify")} disabled={scan.isPending}>
            <BellRing className="mr-2 h-4 w-4" aria-hidden />
            Check and alert admins
          </Button>
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="mb-4 text-h6 font-semibold">Event delivery</h2>
        {report.isLoading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-body-sm">
              <caption className="sr-only">Analytics event delivery outcomes</caption>
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th scope="col" className="py-2 pr-4 font-medium">Event</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Delivered</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Failed</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Skipped</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Duplicates</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Worst latency</th>
                  <th scope="col" className="py-2 font-medium">Last seen</th>
                </tr>
              </thead>
              <tbody>
                {(data?.events ?? []).map((row) => {
                  const critical = data?.critical_events.includes(row.event);
                  const unhealthy = row.failed > 0 || row.duplicates > 0 || (critical && row.ok === 0);
                  return (
                    <tr key={row.event} className="border-b last:border-0">
                      <td className="py-2 pr-4 font-medium">
                        <span className="flex items-center gap-2">
                          {row.event}
                          {critical ? <Badge variant="outline">funnel</Badge> : null}
                        </span>
                      </td>
                      <td className="py-2 pr-4">{row.ok}</td>
                      <td className={cn("py-2 pr-4", row.failed > 0 && "font-semibold text-destructive")}>{row.failed}</td>
                      <td className="py-2 pr-4">{row.skipped}</td>
                      <td className={cn("py-2 pr-4", row.duplicates > 0 && "font-semibold text-destructive")}>{row.duplicates}</td>
                      <td className="py-2 pr-4">{row.maxLatencyMs ? `${row.maxLatencyMs} ms` : "—"}</td>
                      <td className="py-2 text-muted-foreground">
                        {row.lastSeen
                          ? formatDistanceToNow(new Date(row.lastSeen), { addSuffix: true })
                          : unhealthy ? "never" : "—"}
                      </td>
                    </tr>
                  );
                })}
                {!data?.events.length ? (
                  <tr><td colSpan={7} className="py-6 text-center text-muted-foreground">No events recorded in this window.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="p-5">
        <h2 className="mb-4 text-h6 font-semibold">Open alerts</h2>
        {!data?.alerts.length ? (
          <p className="text-body-sm text-muted-foreground">
            No open tracking regressions. The detector runs automatically every 15 minutes.
          </p>
        ) : (
          <ul className="space-y-3">
            {data.alerts.map((alert) => (
              <li key={alert.id} className="rounded-lg border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge variant={alert.severity === "critical" ? "destructive" : "secondary"}>
                        {alert.severity}
                      </Badge>
                      <span className="font-medium">{KIND_COPY[alert.kind] ?? alert.kind}</span>
                      {alert.event_name ? <code className="text-caption text-muted-foreground">{alert.event_name}</code> : null}
                    </div>
                    <p className="mt-1 text-body-sm text-muted-foreground">
                      {JSON.stringify(alert.detail)} · window{" "}
                      {formatDistanceToNow(new Date(alert.window_start), { addSuffix: true })}
                      {alert.notified_at ? " · admins notified" : ""}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        navigator.clipboard.writeText(alert.id);
                        toast.success("Alert id copied");
                      }}
                    >
                      <Copy className="mr-2 h-4 w-4" aria-hidden />
                      Copy id
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => resolve.mutate(alert.id)} disabled={resolve.isPending}>
                      Resolve
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
