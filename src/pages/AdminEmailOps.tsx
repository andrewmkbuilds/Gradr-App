import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Download,
  Eye,
  Loader2,
  Mail,
  MousePointerClick,
  RefreshCw,
  RotateCcw,
  Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { downloadCsv } from "@/lib/exportFile";
import {
  MANIFEST_COLUMNS,
  buildManifest,
  withManifest,
} from "@/lib/email/exportManifest";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const ENDPOINT = "/api/public/admin-email-ops";

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

interface LogRow extends Record<string, unknown> {
  message_id: string;
  template_name: string;
  recipient_email: string;
  status: string;
  error_message: string | null;
  created_at: string;
}

interface MessageDetail {
  messageId: string;
  latest: LogRow;
  attempts: (LogRow & { id: string; metadata: Record<string, unknown> | null })[];
  events: {
    id: string;
    event_type: string;
    url: string | null;
    user_agent: string | null;
    created_at: string;
  }[];
  replay: {
    replayedAs: string | null;
    replayOf: string | null;
    idempotencyKeys: { idempotency_key: string; created_at: string }[];
  };
  suppression: { email: string; reason: string; created_at: string } | null;
}

interface AnomalyRow {
  id: string;
  metric: string;
  severity: string;
  observed: number;
  baseline: number | null;
  threshold: number;
  window_start: string;
  notified_at: string | null;
  notify_error: string | null;
}

interface MetricsResponse {
  range: { start: string; end: string };
  summary: Record<string, number>;
  templates: string[];
  rows: LogRow[];
}

const STATUS_TONE: Record<string, string> = {
  sent: "text-success",
  pending: "text-muted-foreground",
  dlq: "text-destructive",
  failed: "text-destructive",
  suppressed: "text-warning",
};

function isoDaysAgo(days: number) {
  return new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
}

/** Admin-only email delivery, engagement, dead-letter and template surface. */
export default function AdminEmailOps() {
  const queryClient = useQueryClient();
  const [from, setFrom] = useState(isoDaysAgo(7));
  const [to, setTo] = useState(isoDaysAgo(0));
  const [template, setTemplate] = useState("all");
  const [status, setStatus] = useState("all");
  const [previewName, setPreviewName] = useState("welcome");
  const [previewMode, setPreviewMode] = useState<"html" | "text">("html");
  const [authTemplate, setAuthTemplate] = useState("signup");
  const [openMessage, setOpenMessage] = useState<string | null>(null);

  const filters = useMemo(
    () => ({
      from: new Date(`${from}T00:00:00Z`).toISOString(),
      to: new Date(`${to}T23:59:59Z`).toISOString(),
      template: template === "all" ? "" : template,
      status: status === "all" ? "" : status,
    }),
    [from, to, template, status],
  );

  const metrics = useQuery({
    queryKey: ["email-ops-metrics", filters],
    queryFn: () => callApi<MetricsResponse>({ action: "log", ...filters }),
  });

  const dlq = useQuery({
    queryKey: ["email-ops-dlq"],
    queryFn: () => callApi<{ rows: LogRow[] }>({ action: "dlq" }),
  });

  const preview = useQuery({
    queryKey: ["email-ops-preview", previewName],
    queryFn: () =>
      callApi<{ templates: string[]; subject: string; html: string; text: string }>({
        action: "preview",
        template: previewName,
      }),
  });

  // Branded auth-email preview, with a live image reachability audit so a
  // broken logo URL is visible here before any user receives it.
  const authPreview = useQuery({
    queryKey: ["email-ops-auth-preview", authTemplate],
    queryFn: () =>
      callApi<{
        templates: { key: string; label: string }[];
        label: string;
        subject: string;
        html: string;
        text: string;
        images: { url: string; ok: boolean; status: number | null; contentType: string | null; reason?: string }[];
      }>({ action: "auth-preview", template: authTemplate, auditImages: true }),
  });

  const anomalies = useQuery({
    queryKey: ["email-ops-anomalies"],
    queryFn: () => callApi<{ rows: AnomalyRow[] }>({ action: "anomalies" }),
  });

  const detail = useQuery({
    queryKey: ["email-ops-message", openMessage],
    enabled: Boolean(openMessage),
    queryFn: () => callApi<MessageDetail>({ action: "message", messageId: openMessage }),
  });

  const replay = useMutation({
    mutationFn: (messageId: string) =>
      callApi<{ replayed: boolean; idempotent: boolean; reason?: string }>({
        action: "replay",
        messageId,
      }),
    onSuccess: (result) => {
      if (result.replayed) toast.success("Re-queued — it will send on the next queue tick.");
      else toast.info(result.reason ?? "Already replayed — no duplicate was sent.");
      queryClient.invalidateQueries({ queryKey: ["email-ops-dlq"] });
      queryClient.invalidateQueries({ queryKey: ["email-ops-metrics"] });
      queryClient.invalidateQueries({ queryKey: ["email-ops-message"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const summary = metrics.data?.summary ?? {};
  const cards = [
    { label: "Emails", value: summary["total"] ?? 0, icon: Mail, tone: "text-primary" },
    { label: "Sent", value: summary["sent"] ?? 0, icon: Send, tone: "text-success" },
    { label: "Failed", value: summary["failed"] ?? 0, icon: AlertTriangle, tone: "text-destructive" },
    { label: "Opened", value: summary["opened"] ?? 0, icon: Eye, tone: "text-accent-foreground" },
    { label: "Clicked", value: summary["clicked"] ?? 0, icon: MousePointerClick, tone: "text-primary" },
    { label: "Bounced", value: summary["bounced"] ?? 0, icon: AlertTriangle, tone: "text-warning" },
  ];

  const exportRows = () => {
    const rows = metrics.data?.rows ?? [];
    if (rows.length === 0) {
      toast.error("Nothing to export for these filters");
      return;
    }
    // The manifest travels with every row so a downloaded file stays
    // self-describing and auditable after it leaves the dashboard.
    const manifest = buildManifest({ from, to, template, status }, rows.length);
    downloadCsv(`email-delivery-${to}.csv`, withManifest(rows, manifest), [
      "created_at",
      "template_name",
      "recipient_email",
      "status",
      "error_message",
      "message_id",
      ...MANIFEST_COLUMNS,
    ]);
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-4 md:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Email operations</h1>
          <p className="text-sm text-muted-foreground">
            Delivery, engagement, dead-letter recovery and template previews.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportRows}>
            <Download className="mr-2 h-4 w-4" aria-hidden="true" /> Export CSV
          </Button>
          <Button variant="outline" onClick={() => void metrics.refetch()} disabled={metrics.isFetching}>
            {metrics.isFetching ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            Refresh
          </Button>
        </div>
      </header>

      <Card className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1">
          <Label htmlFor="email-from">From</Label>
          <Input id="email-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="email-to">To</Label>
          <Input id="email-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Campaign / template</Label>
          <Select value={template} onValueChange={setTemplate}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All templates</SelectItem>
              {(metrics.data?.templates ?? []).map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Status</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="sent">Sent</SelectItem>
              <SelectItem value="pending">Queued</SelectItem>
              <SelectItem value="dlq">Dead-lettered</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="suppressed">Suppressed</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {cards.map((c) => (
          <Card key={c.label} className="p-4">
            <c.icon className={`mb-2 h-4 w-4 ${c.tone}`} aria-hidden="true" />
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{c.label}</p>
            <p className="text-2xl font-semibold text-foreground">{c.value}</p>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="log">
        <TabsList>
          <TabsTrigger value="log">Delivery log</TabsTrigger>
          <TabsTrigger value="dlq">Dead letters</TabsTrigger>
          <TabsTrigger value="preview">Template preview</TabsTrigger>
          <TabsTrigger value="auth">Auth emails</TabsTrigger>
          <TabsTrigger value="anomalies">Anomalies</TabsTrigger>
        </TabsList>

        <TabsContent value="log">
          <Card className="p-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="py-2">Sent</th>
                    <th className="py-2">Template</th>
                    <th className="py-2">Recipient</th>
                    <th className="py-2">Status</th>
                    <th className="py-2">Error</th>
                    <th className="py-2 sr-only">Inspect</th>
                  </tr>
                </thead>
                <tbody>
                  {(metrics.data?.rows ?? []).length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-4 text-muted-foreground">
                        No emails match these filters.
                      </td>
                    </tr>
                  )}
                  {(metrics.data?.rows ?? []).map((r) => (
                    <tr key={r.message_id} className="border-t border-border/60">
                      <td className="py-2 whitespace-nowrap">
                        {new Date(r.created_at).toLocaleString()}
                      </td>
                      <td className="py-2 font-medium text-foreground">{r.template_name}</td>
                      <td className="py-2">{r.recipient_email}</td>
                      <td className={`py-2 ${STATUS_TONE[r.status] ?? ""}`}>{r.status}</td>
                      <td className="max-w-[18rem] truncate py-2 text-xs text-muted-foreground">
                        {r.error_message ?? "—"}
                      </td>
                      <td className="py-2 text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setOpenMessage(r.message_id)}
                        >
                          Inspect
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="dlq">
          <Card className="p-4">
            <p className="mb-3 text-sm text-muted-foreground">
              Messages that exhausted every retry. Replays are idempotent — a message can only be
              re-queued once, so double-clicking never sends a duplicate.
            </p>
            {(dlq.data?.rows ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No dead-lettered messages. </p>
            ) : (
              <ul className="divide-y divide-border/60">
                {(dlq.data?.rows ?? []).map((r) => (
                  <li key={r.message_id} className="flex flex-wrap items-center gap-3 py-3">
                    <Badge variant="outline" className="text-destructive">dlq</Badge>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {r.template_name} → {r.recipient_email}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {r.error_message ?? "No error recorded"}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={replay.isPending}
                      onClick={() => replay.mutate(r.message_id)}
                    >
                      <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" /> Replay
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="preview">
          <Card className="space-y-3 p-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[16rem] flex-1 space-y-1">
                <Label>Template</Label>
                <Select value={previewName} onValueChange={setPreviewName}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    {(preview.data?.templates ?? [previewName]).map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2">
                <Button
                  variant={previewMode === "html" ? "default" : "outline"}
                  onClick={() => setPreviewMode("html")}
                >
                  HTML
                </Button>
                <Button
                  variant={previewMode === "text" ? "default" : "outline"}
                  onClick={() => setPreviewMode("text")}
                >
                  Plain text
                </Button>
              </div>
            </div>
            {preview.data?.subject && (
              <p className="text-sm text-muted-foreground">
                Subject: <span className="text-foreground">{preview.data.subject}</span>
              </p>
            )}
            {preview.isLoading ? (
              <p className="text-sm text-muted-foreground">Rendering…</p>
            ) : previewMode === "html" ? (
              <iframe
                title={`${previewName} preview`}
                srcDoc={preview.data?.html ?? ""}
                className="h-[36rem] w-full rounded-lg border border-border bg-white"
              />
            ) : (
              <pre className="max-h-[36rem] overflow-auto rounded-lg border border-border bg-muted/40 p-4 text-xs text-foreground">
                {preview.data?.text ?? ""}
              </pre>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="auth">
          <Card className="space-y-3 p-4">
            <p className="text-sm text-muted-foreground">
              The exact components the auth webhook renders, with sample tokens. Every image is
              fetched live so a broken logo shows up here, not in someone's inbox.
            </p>
            <div className="min-w-[16rem] max-w-sm space-y-1">
              <Label>Auth template</Label>
              <Select value={authTemplate} onValueChange={setAuthTemplate}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(authPreview.data?.templates ?? [{ key: authTemplate, label: authTemplate }]).map((t) => (
                    <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {authPreview.data?.subject && (
              <p className="text-sm text-muted-foreground">
                Subject: <span className="text-foreground">{authPreview.data.subject}</span>
              </p>
            )}
            {(authPreview.data?.images ?? []).length > 0 && (
              <ul className="space-y-1 text-xs">
                {(authPreview.data?.images ?? []).map((img) => (
                  <li key={img.url} className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className={img.ok ? "text-success" : "text-destructive"}>
                      {img.ok ? "200" : (img.status ?? "fail")}
                    </Badge>
                    <span className="truncate text-muted-foreground">{img.url}</span>
                    {!img.ok && <span className="text-destructive">{img.reason}</span>}
                  </li>
                ))}
              </ul>
            )}
            {authPreview.isLoading ? (
              <p className="text-sm text-muted-foreground">Rendering…</p>
            ) : (
              <iframe
                title={`${authTemplate} auth email preview`}
                srcDoc={authPreview.data?.html ?? ""}
                className="h-[36rem] w-full rounded-lg border border-border bg-white"
              />
            )}
          </Card>
        </TabsContent>

        <TabsContent value="anomalies">
          <Card className="p-4">
            <p className="mb-3 text-sm text-muted-foreground">
              Hourly checks on volume spikes, bounce rate, spam complaints and delivery failures.
              Each anomaly is raised once per hour window and pushed to admin notifications.
            </p>
            {(anomalies.data?.rows ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No anomalies detected. Delivery is within expected thresholds.
              </p>
            ) : (
              <ul className="divide-y divide-border/60">
                {(anomalies.data?.rows ?? []).map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center gap-3 py-3">
                    <Badge
                      variant="outline"
                      className={a.severity === "critical" ? "text-destructive" : "text-warning"}
                    >
                      {a.severity}
                    </Badge>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground">{a.metric}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(a.window_start).toLocaleString()} · observed {a.observed} vs
                        threshold {a.threshold}
                        {a.baseline != null ? ` (baseline ${a.baseline})` : ""}
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {a.notify_error ? `alert failed: ${a.notify_error}` : a.notified_at ? "alerted" : "pending"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </TabsContent>
      </Tabs>
      <Dialog open={Boolean(openMessage)} onOpenChange={(open) => !open && setOpenMessage(null)}>
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Message delivery history</DialogTitle>
            <DialogDescription className="break-all">{openMessage}</DialogDescription>
          </DialogHeader>

          {detail.isLoading && <p className="text-sm text-muted-foreground">Loading history…</p>}
          {detail.error && (
            <p className="text-sm text-destructive">{(detail.error as Error).message}</p>
          )}

          {detail.data && (
            <div className="space-y-5 text-sm">
              <section>
                <h3 className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
                  Delivery attempts
                </h3>
                <ul className="space-y-2">
                  {detail.data.attempts.map((a) => (
                    <li key={a.id} className="rounded-lg border border-border/60 p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className={STATUS_TONE[a.status] ?? ""}>
                          {a.status}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {new Date(a.created_at).toLocaleString()}
                        </span>
                        {a.message_id !== detail.data!.messageId && (
                          <span className="text-xs text-muted-foreground">({a.message_id})</span>
                        )}
                      </div>
                      {a.error_message && (
                        <p className="mt-1 text-xs text-destructive">{a.error_message}</p>
                      )}
                      {a.metadata && Object.keys(a.metadata).length > 0 && (
                        <pre className="mt-2 overflow-x-auto rounded bg-muted/40 p-2 text-[11px] text-muted-foreground">
                          {JSON.stringify(a.metadata, null, 2)}
                        </pre>
                      )}
                    </li>
                  ))}
                </ul>
              </section>

              <section>
                <h3 className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
                  Recipient events
                </h3>
                {detail.data.events.length === 0 ? (
                  <p className="text-muted-foreground">
                    No opens, clicks, bounces or complaints recorded.
                  </p>
                ) : (
                  <ul className="space-y-1">
                    {detail.data.events.map((e) => (
                      <li key={e.id} className="flex flex-wrap items-center gap-2 text-xs">
                        <Badge variant="outline">{e.event_type}</Badge>
                        <span className="text-muted-foreground">
                          {new Date(e.created_at).toLocaleString()}
                        </span>
                        {e.url && <span className="truncate text-muted-foreground">{e.url}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section>
                <h3 className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
                  Replay history
                </h3>
                <p className="text-muted-foreground">
                  {detail.data.replay.replayOf
                    ? `This is a replay of ${detail.data.replay.replayOf}.`
                    : detail.data.replay.replayedAs
                      ? `Replayed once as ${detail.data.replay.replayedAs}. Further replays are blocked.`
                      : "Never replayed."}
                </p>
                {detail.data.replay.idempotencyKeys.length > 0 && (
                  <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
                    {detail.data.replay.idempotencyKeys.map((k) => (
                      <li key={k.idempotency_key} className="break-all">
                        {k.idempotency_key} · {new Date(k.created_at).toLocaleString()}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {detail.data.suppression && (
                <section>
                  <h3 className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
                    Suppression
                  </h3>
                  <p className="text-warning">
                    {detail.data.suppression.email} is suppressed (
                    {detail.data.suppression.reason}) since{" "}
                    {new Date(detail.data.suppression.created_at).toLocaleDateString()}.
                  </p>
                </section>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
