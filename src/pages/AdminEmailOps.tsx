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

interface LogRow {
  message_id: string;
  template_name: string;
  recipient_email: string;
  status: string;
  error_message: string | null;
  created_at: string;
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
    const exportId = crypto.randomUUID();
    const exportedAt = new Date().toISOString();
    const manifest = `range=${from}..${to};template=${template};status=${status}`;
    downloadCsv(
      `email-delivery-${to}.csv`,
      rows.map((r) => ({ ...r, export_id: exportId, exported_at: exportedAt, export_filters: manifest })),
      [
        "created_at",
        "template_name",
        "recipient_email",
        "status",
        "error_message",
        "message_id",
        "export_id",
        "exported_at",
        "export_filters",
      ],
    );
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
                  </tr>
                </thead>
                <tbody>
                  {(metrics.data?.rows ?? []).length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-4 text-muted-foreground">
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
      </Tabs>
    </div>
  );
}
