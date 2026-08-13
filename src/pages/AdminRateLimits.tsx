import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  Download,
  Gauge,
  History,
  Loader2,
  Pencil,
  RotateCcw,
  ShieldAlert,
  Timer,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { downloadCsv } from "@/lib/exportFile";
import { toast } from "sonner";

const ENDPOINT = "/api/public/admin-endpoint-policy";

async function callApi<T>(body: Record<string, unknown>): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Your session expired — sign in again.");
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const payload = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new Error(payload.error ?? `Request failed (${res.status})`);
  return payload;
}

interface HealthEvent {
  endpoint: string;
  status_code: number;
  outcome: string;
  created_at: string;
}

interface FlatPolicy {
  limit: number | null;
  windowMs: number | null;
  backoffSeconds: number | null;
  maxBackoffSeconds: number | null;
  disabled: boolean;
  alertAfter: Record<string, number | undefined>;
}

interface PolicyRow {
  endpoint: string;
  base: FlatPolicy;
  effective: FlatPolicy;
  override: Record<string, unknown> | null;
}

interface AuditRow {
  id: string;
  actor_id: string | null;
  resource_id: string | null;
  created_at: string;
  details: { operation?: string; before?: unknown; after?: unknown } | null;
}

function describeBackoff(base: number | null, max: number | null) {
  if (!base) return "none";
  return `${base}s → ${max ?? base}s (x2 per strike)`;
}

interface DraftState {
  rateLimit: string;
  windowMs: string;
  backoffSeconds: string;
  maxBackoffSeconds: string;
  alertServerError: string;
  alertRateLimited: string;
  disabled: boolean;
  note: string;
}

const str = (v: number | null | undefined) => (v == null ? "" : String(v));

function draftFrom(row: PolicyRow): DraftState {
  const e = row.effective;
  return {
    rateLimit: str(e.limit),
    windowMs: str(e.windowMs),
    backoffSeconds: str(e.backoffSeconds),
    maxBackoffSeconds: str(e.maxBackoffSeconds),
    alertServerError: str(e.alertAfter["server_error"]),
    alertRateLimited: str(e.alertAfter["rate_limited"]),
    disabled: e.disabled,
    note: typeof row.override?.["note"] === "string" ? (row.override["note"] as string) : "",
  };
}

/**
 * Per-endpoint reliability policy: the live limits, the throttling they
 * actually produced, and inline editing so a bucket can be retuned in seconds
 * instead of a deploy. Every change is audited with its before/after values.
 */
export default function AdminRateLimits() {
  const queryClient = useQueryClient();
  const [days, setDays] = useState(7);
  const [editing, setEditing] = useState<PolicyRow | null>(null);
  const [draft, setDraft] = useState<DraftState | null>(null);

  useEffect(() => {
    setDraft(editing ? draftFrom(editing) : null);
  }, [editing]);

  const since = useMemo(() => new Date(Date.now() - days * 864e5).toISOString(), [days]);

  const policies = useQuery({
    queryKey: ["endpoint-policies"],
    queryFn: () => callApi<{ endpoints: PolicyRow[] }>({ action: "list" }),
  });

  const audit = useQuery({
    queryKey: ["endpoint-policy-audit"],
    queryFn: () => callApi<{ rows: AuditRow[] }>({ action: "audit" }),
  });

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

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => callApi<{ ok: boolean }>(body),
    onSuccess: () => {
      toast.success("Policy updated — it takes effect within a minute across all instances.");
      setEditing(null);
      queryClient.invalidateQueries({ queryKey: ["endpoint-policies"] });
      queryClient.invalidateQueries({ queryKey: ["endpoint-policy-audit"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const stats = useMemo(() => {
    const acc: Record<string, { total: number; throttled: number; errors: number }> = {};
    for (const e of traffic.data ?? []) {
      const row = (acc[e.endpoint] ??= { total: 0, throttled: 0, errors: 0 });
      row.total += 1;
      if (e.status_code === 429) row.throttled += 1;
      if (e.status_code >= 500) row.errors += 1;
    }
    return acc;
  }, [traffic.data]);

  const rows = useMemo(() => {
    const list = policies.data?.endpoints ?? [];
    return [...list].sort((a, b) => {
      const at = stats[a.endpoint]?.throttled ?? 0;
      const bt = stats[b.endpoint]?.throttled ?? 0;
      if (at !== bt) return bt - at;
      return a.endpoint.localeCompare(b.endpoint);
    });
  }, [policies.data, stats]);

  const totalThrottled = Object.values(stats).reduce((n, s) => n + s.throttled, 0);

  const exportCsv = () =>
    downloadCsv(
      `rate-limit-policies-${new Date().toISOString().slice(0, 10)}.csv`,
      rows.map(({ endpoint, effective, override }) => ({
        endpoint,
        limit: effective.disabled ? "unlimited" : (effective.limit ?? ""),
        window_seconds: effective.windowMs ? Math.round(effective.windowMs / 1000) : "",
        backoff: describeBackoff(effective.backoffSeconds, effective.maxBackoffSeconds),
        alert_server_error: effective.alertAfter["server_error"] ?? "",
        alert_rate_limited: effective.alertAfter["rate_limited"] ?? "",
        overridden: override ? "yes" : "no",
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
        "overridden",
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
            Live policy per endpoint, next to the throttling it actually produced. Edits apply
            without a deploy.
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
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Configured endpoints
          </p>
          <p className="text-2xl font-semibold text-foreground">{rows.length}</p>
        </Card>
        <Card className="p-4">
          <ShieldAlert className="mb-2 h-4 w-4 text-warning" aria-hidden="true" />
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Throttled requests
          </p>
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
                <th className="py-2 text-right">Edit</th>
              </tr>
            </thead>
            <tbody>
              {policies.isLoading && (
                <tr>
                  <td colSpan={8} className="py-4 text-muted-foreground">
                    Loading policy…
                  </td>
                </tr>
              )}
              {rows.map((row) => {
                const s = stats[row.endpoint];
                const e = row.effective;
                return (
                  <tr key={row.endpoint} className="border-t border-border/60">
                    <td className="py-2 font-medium text-foreground">
                      {row.endpoint}
                      {row.override && (
                        <Badge variant="outline" className="ml-2 text-mahogany">
                          overridden
                        </Badge>
                      )}
                    </td>
                    <td className="py-2">
                      {e.disabled ? (
                        <Badge variant="outline">unlimited</Badge>
                      ) : (
                        <span className="whitespace-nowrap">
                          {e.limit} / {Math.round((e.windowMs ?? 0) / 1000)}s
                        </span>
                      )}
                    </td>
                    <td className="py-2 whitespace-nowrap text-muted-foreground">
                      <Timer className="mr-1 inline h-3 w-3" aria-hidden="true" />
                      {e.disabled ? "—" : describeBackoff(e.backoffSeconds, e.maxBackoffSeconds)}
                    </td>
                    <td className="py-2 text-xs text-muted-foreground">
                      5xx ×{e.alertAfter["server_error"] ?? "—"} · 429 ×
                      {e.alertAfter["rate_limited"] ?? "—"}
                    </td>
                    <td className="py-2 text-right">{s?.total ?? 0}</td>
                    <td
                      className={`py-2 text-right ${(s?.throttled ?? 0) > 0 ? "text-warning" : ""}`}
                    >
                      {s?.throttled ?? 0}
                    </td>
                    <td
                      className={`py-2 text-right ${(s?.errors ?? 0) > 0 ? "text-destructive" : ""}`}
                    >
                      {s?.errors ?? 0}
                    </td>
                    <td className="py-2 text-right">
                      <Button size="sm" variant="ghost" onClick={() => setEditing(row)}>
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                        <span className="sr-only">Edit {row.endpoint}</span>
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Endpoints not listed use the default bucket (60 requests / 60s, 5s backoff). Sustained
          throttling usually means the bucket is too tight for normal page behaviour rather than
          abuse.
        </p>
      </Card>

      <Card className="p-4">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
          <History className="h-4 w-4" aria-hidden="true" /> Change history
        </h2>
        {(audit.data?.rows ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No policy changes recorded yet.</p>
        ) : (
          <ul className="divide-y divide-border/60 text-sm">
            {(audit.data?.rows ?? []).map((r) => (
              <li key={r.id} className="py-2">
                <p className="text-foreground">
                  <span className="font-medium">{r.details?.operation ?? "change"}</span>{" "}
                  {r.resource_id}
                </p>
                <p className="text-xs text-muted-foreground">
                  {new Date(r.created_at).toLocaleString()} · actor {r.actor_id?.slice(0, 8) ?? "—"}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Dialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit policy</DialogTitle>
            <DialogDescription className="break-all">{editing?.endpoint}</DialogDescription>
          </DialogHeader>

          {draft && editing && (
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-lg border border-border/60 p-3">
                <div>
                  <p className="text-sm font-medium text-foreground">Disable rate limiting</p>
                  <p className="text-xs text-muted-foreground">
                    Only for endpoints that must never be throttled.
                  </p>
                </div>
                <Switch
                  checked={draft.disabled}
                  onCheckedChange={(v) => setDraft({ ...draft, disabled: v })}
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {(
                  [
                    ["rateLimit", "Requests"],
                    ["windowMs", "Window (ms)"],
                    ["backoffSeconds", "Backoff (s)"],
                    ["maxBackoffSeconds", "Max backoff (s)"],
                    ["alertServerError", "Alert after 5xx"],
                    ["alertRateLimited", "Alert after 429"],
                  ] as const
                ).map(([key, label]) => (
                  <div key={key} className="space-y-1">
                    <Label htmlFor={`policy-${key}`}>{label}</Label>
                    <Input
                      id={`policy-${key}`}
                      type="number"
                      min={0}
                      value={draft[key]}
                      disabled={draft.disabled && key !== "alertServerError" && key !== "alertRateLimited"}
                      onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
                    />
                  </div>
                ))}
              </div>

              <div className="space-y-1">
                <Label htmlFor="policy-note">Why (recorded in the audit log)</Label>
                <Input
                  id="policy-note"
                  value={draft.note}
                  placeholder="e.g. legitimate traffic was being throttled at peak"
                  onChange={(e) => setDraft({ ...draft, note: e.target.value })}
                />
              </div>

              <p className="text-xs text-muted-foreground">
                Code default: {editing.base.disabled ? "unlimited" : `${editing.base.limit} / ${Math.round((editing.base.windowMs ?? 0) / 1000)}s`}
                , backoff {describeBackoff(editing.base.backoffSeconds, editing.base.maxBackoffSeconds)}.
              </p>
            </div>
          )}

          <DialogFooter className="gap-2">
            {editing?.override && (
              <Button
                variant="outline"
                disabled={save.isPending}
                onClick={() => save.mutate({ action: "reset", endpoint: editing.endpoint })}
              >
                <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" /> Reset to default
              </Button>
            )}
            <Button
              disabled={save.isPending || !draft}
              onClick={() =>
                draft &&
                editing &&
                save.mutate({ action: "save", endpoint: editing.endpoint, ...draft })
              }
            >
              {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save policy
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
