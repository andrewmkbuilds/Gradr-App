import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, FlaskConical, PlayCircle, RefreshCw, RotateCcw } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/app/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ds/Button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/**
 * Billing operations console.
 *
 * Three views over the same incident: the alert that fired, the delivery that
 * caused it, and the simulator that lets an operator reproduce it in sandbox.
 * Every mutating control routes through `payments-watchdog` / `payments-simulate`
 * so the service role stays server-side.
 */

interface AlertRow {
  id: string;
  alert_type: string;
  severity: string;
  environment: string;
  subject: string;
  details: Record<string, unknown>;
  notified_at: string | null;
  resolved_at: string | null;
  created_at: string;
}

interface DeliveryRow {
  id: string;
  event_id: string;
  event_type: string | null;
  environment: string | null;
  state: string;
  attempts: number;
  replays: number;
  last_error: string | null;
  next_retry_at: string | null;
  updated_at: string;
}

interface SimulationRow {
  id: string;
  scenario: string;
  ok: boolean;
  result: Record<string, unknown>;
  created_at: string;
}

const SCENARIOS = [
  { value: "webhook_failure", label: "Queue a failed webhook delivery" },
  { value: "payment_failed", label: "Declined renewal (starts dunning)" },
  { value: "refund_credit_pack", label: "Refund a credit pack purchase" },
  { value: "refund_subscription", label: "Refund a subscription payment" },
  { value: "run_watchdog", label: "Run the watchdog sweep now" },
];

function SeverityBadge({ severity }: { severity: string }) {
  if (severity === "critical") return <Badge variant="destructive">critical</Badge>;
  if (severity === "warning") return <Badge variant="outline">warning</Badge>;
  return <Badge variant="secondary">{severity}</Badge>;
}

function StateBadge({ state }: { state: string }) {
  if (state === "processed") return <Badge variant="secondary">processed</Badge>;
  if (state === "failed") return <Badge variant="destructive">failed</Badge>;
  return <Badge variant="outline">{state}</Badge>;
}

type QueryResult<T> = Promise<{ data: T[] | null; error: { message: string } | null }>;
type Chainable<T> = QueryResult<T> & {
  is: (col: string, val: null) => Chainable<T>;
  not: (col: string, op: string, val: null) => Chainable<T>;
  eq: (col: string, val: string) => Chainable<T>;
  order: (col: string, opts: { ascending: boolean }) => Chainable<T>;
  select: (cols: string) => Chainable<T>;
  limit: (n: number) => Chainable<T>;
};

function fromTable<T>(table: string): Chainable<T> {
  return (supabase as unknown as { from: (t: string) => Chainable<T> }).from(table);
}

export default function AdminBillingOps() {
  const qc = useQueryClient();
  const [alertFilter, setAlertFilter] = useState("open");
  const [deliveryFilter, setDeliveryFilter] = useState("failed");
  const [scenario, setScenario] = useState(SCENARIOS[0].value);
  const [busy, setBusy] = useState<string | null>(null);

  const alerts = useQuery({
    queryKey: ["billing-alerts", alertFilter],
    queryFn: async () => {
      let q = fromTable<AlertRow>("billing_alerts").select("*").order("created_at", { ascending: false }).limit(100);
      if (alertFilter === "open") q = q.is("resolved_at", null);
      if (alertFilter === "resolved") q = q.not("resolved_at", "is", null);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as AlertRow[];
    },
  });

  const deliveries = useQuery({
    queryKey: ["billing-deliveries", deliveryFilter],
    queryFn: async () => {
      let q = fromTable<DeliveryRow>("webhook_deliveries")
        .select(
          "id, event_id, event_type, environment, state, attempts, replays, last_error, next_retry_at, updated_at",
        )
        .eq("provider", "paddle")
        .order("updated_at", { ascending: false })
        .limit(100);
      if (deliveryFilter !== "all") q = q.eq("state", deliveryFilter);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as DeliveryRow[];
    },
  });

  const simulations = useQuery({
    queryKey: ["payment-simulations"],
    queryFn: async () => {
      const { data, error } = await fromTable<SimulationRow>("payment_simulations")
        .select("id, scenario, ok, result, created_at")
        .order("created_at", { ascending: false })
        .limit(25);
      if (error) throw error;
      return (data ?? []) as SimulationRow[];
    },
  });

  const callWatchdog = async (body: Record<string, unknown>, label: string, key: string) => {
    setBusy(key);
    const { data, error } = await supabase.functions.invoke("payments-watchdog", { body });
    setBusy(null);
    const payload = data as { ok?: boolean; error?: string } | null;
    if (error || payload?.ok === false) {
      toast.error(`${label} failed`, { description: payload?.error ?? error?.message });
      return;
    }
    toast.success(`${label} complete`);
    qc.invalidateQueries({ queryKey: ["billing-alerts"] });
    qc.invalidateQueries({ queryKey: ["billing-deliveries"] });
  };

  const runSimulation = async () => {
    setBusy("simulate");
    const { data, error } = await supabase.functions.invoke("payments-simulate", {
      body: { scenario, environment: "sandbox" },
    });
    setBusy(null);
    if (error) {
      toast.error("Simulation failed", { description: error.message });
    } else {
      const ok = (data as { ok?: boolean } | null)?.ok;
      if (ok) {
        toast.success("Simulation dispatched");
      } else {
        toast.error("Simulation returned an error");
      }
    }
    qc.invalidateQueries({ queryKey: ["payment-simulations"] });
    qc.invalidateQueries({ queryKey: ["billing-deliveries"] });
    qc.invalidateQueries({ queryKey: ["billing-alerts"] });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Billing operations"
        description="Alerts, webhook retries and sandbox failure simulations in one place."
        actions={
          <Button
            variant="outline"
            disabled={busy === "sweep"}
            onClick={() => callWatchdog({ action: "sweep" }, "Watchdog sweep", "sweep")}
          >
            <RefreshCw className={busy === "sweep" ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
            Run watchdog
          </Button>
        }
      />

      <Tabs defaultValue="alerts">
        <TabsList>
          <TabsTrigger value="alerts">Alerts</TabsTrigger>
          <TabsTrigger value="deliveries">Webhook retries</TabsTrigger>
          <TabsTrigger value="simulator">Simulator</TabsTrigger>
        </TabsList>

        <TabsContent value="alerts" className="space-y-4 pt-4">
          <div className="flex items-center gap-3">
            <Select value={alertFilter} onValueChange={setAlertFilter}>
              <SelectTrigger aria-label="Filter alerts" className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
                <SelectItem value="all">All</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {alerts.isLoading
            ? <Skeleton className="h-40 w-full" />
            : alerts.data?.length
              ? (
                <div className="space-y-3">
                  {alerts.data.map((a) => (
                    <Card key={a.id} className="p-4 elev-1">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <SeverityBadge severity={a.severity} />
                            <span className="font-medium text-sm">{a.subject}</span>
                            <Badge variant="outline">{a.environment}</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {a.alert_type} · {formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}
                            {a.resolved_at ? " · resolved" : ""}
                          </p>
                          <pre className="text-[11px] text-muted-foreground bg-muted/40 rounded-md p-2 overflow-x-auto">
                            {JSON.stringify(a.details, null, 2)}
                          </pre>
                        </div>
                        {!a.resolved_at && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy === a.id}
                            onClick={() => callWatchdog({ action: "resolve_alert", alertId: a.id }, "Resolve alert", a.id)}
                          >
                            <CheckCircle2 className="h-4 w-4" /> Resolve
                          </Button>
                        )}
                      </div>
                    </Card>
                  ))}
                </div>
              )
              : (
                <Card className="p-10 text-center text-sm text-muted-foreground elev-1">
                  <CheckCircle2 className="h-6 w-6 mx-auto mb-2 text-primary" />
                  No {alertFilter === "open" ? "open " : ""}alerts. Billing is healthy.
                </Card>
              )}
        </TabsContent>

        <TabsContent value="deliveries" className="space-y-4 pt-4">
          <Select value={deliveryFilter} onValueChange={setDeliveryFilter}>
            <SelectTrigger aria-label="Filter webhook deliveries" className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="processed">Processed</SelectItem>
              <SelectItem value="received">Received</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>

          {deliveries.isLoading
            ? <Skeleton className="h-40 w-full" />
            : deliveries.data?.length
              ? (
                <div className="space-y-2">
                  {deliveries.data.map((d) => (
                    <Card key={d.id} className="p-4 elev-1">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <StateBadge state={d.state} />
                            <span className="font-mono text-xs">{d.event_type ?? "unknown"}</span>
                            <Badge variant="outline">{d.environment ?? "sandbox"}</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground font-mono truncate">{d.event_id}</p>
                          <p className="text-xs text-muted-foreground">
                            {d.attempts} attempts · {d.replays} replays ·{" "}
                            {formatDistanceToNow(new Date(d.updated_at), { addSuffix: true })}
                            {d.next_retry_at ? ` · next retry ${formatDistanceToNow(new Date(d.next_retry_at), { addSuffix: true })}` : ""}
                          </p>
                          {d.last_error && (
                            <p className="text-xs text-destructive flex items-center gap-1.5">
                              <AlertTriangle className="h-3.5 w-3.5" />{d.last_error}
                            </p>
                          )}
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy === d.id}
                          onClick={() => callWatchdog({ action: "replay_delivery", deliveryId: d.id }, "Replay", d.id)}
                        >
                          <RotateCcw className={busy === d.id ? "h-4 w-4 animate-spin" : "h-4 w-4"} /> Replay
                        </Button>
                      </div>
                    </Card>
                  ))}
                </div>
              )
              : <Card className="p-10 text-center text-sm text-muted-foreground elev-1">No deliveries match this filter.</Card>}
        </TabsContent>

        <TabsContent value="simulator" className="space-y-4 pt-4">
          <Card className="p-6 space-y-4 elev-1">
            <div className="flex items-start gap-3">
              <FlaskConical className="h-5 w-5 text-primary mt-0.5" />
              <div>
                <h2 className="font-semibold">Sandbox failure simulator</h2>
                <p className="text-sm text-muted-foreground">
                  Fires synthetic events at the live handlers in the test environment only. Live is refused server-side.
                </p>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <Select value={scenario} onValueChange={setScenario}>
                <SelectTrigger aria-label="Select webhook event" className="sm:w-96"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SCENARIOS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button onClick={runSimulation} disabled={busy === "simulate"}>
                <PlayCircle className={busy === "simulate" ? "h-4 w-4 animate-spin" : "h-4 w-4"} /> Run simulation
              </Button>
            </div>
          </Card>

          <div className="space-y-2">
            {(simulations.data ?? []).map((s) => (
              <Card key={s.id} className="p-4 elev-1 space-y-1">
                <div className="flex items-center gap-2">
                  {s.ok
                    ? <Badge variant="secondary">ok</Badge>
                    : <Badge variant="destructive">failed</Badge>}
                  <span className="text-sm font-medium">{s.scenario}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(s.created_at), { addSuffix: true })}
                  </span>
                </div>
                <pre className="text-[11px] text-muted-foreground bg-muted/40 rounded-md p-2 overflow-x-auto">
                  {JSON.stringify(s.result, null, 2)}
                </pre>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
