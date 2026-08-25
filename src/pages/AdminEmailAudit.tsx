import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Download, RefreshCw, ScrollText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/app/PageHeader";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ds/Button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmailWeeklyReportCard } from "@/components/admin/EmailWeeklyReportCard";
import { EmailPipelineAlertsCard } from "@/components/admin/EmailPipelineAlertsCard";
import { EmailRetentionCard } from "@/components/admin/EmailRetentionCard";
import { AdminErrorState } from "@/components/admin/AdminErrorState";
import { toast } from "sonner";

interface AuditRow {
  id: string;
  occurred_at: string;
  event: string;
  template_name: string;
  category_label: string | null;
  recipient_email: string;
  recipient_user_id: string | null;
  message_id: string | null;
  reason: string | null;
  source: string;
}

const EVENT_VARIANT: Record<string, "secondary" | "outline" | "destructive"> = {
  sent: "secondary",
  queued: "outline",
  dry_run: "outline",
  suppressed: "destructive",
  failed: "destructive",
  bounced: "destructive",
  complained: "destructive",
  dlq: "destructive",
};

const CSV_COLUMNS: Array<{ key: keyof AuditRow; header: string }> = [
  { key: "occurred_at", header: "Occurred at" },
  { key: "event", header: "Event" },
  { key: "template_name", header: "Template id" },
  { key: "category_label", header: "Category label" },
  { key: "recipient_email", header: "Recipient" },
  { key: "recipient_user_id", header: "Account id" },
  { key: "message_id", header: "Message id" },
  { key: "reason", header: "Reason" },
  { key: "source", header: "Source" },
];

/** RFC-4180 escaping: quote everything, double any embedded quote. */
const csvCell = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;

/**
 * Delivery audit log — every queued, sent, suppressed, failed and dry-run
 * email, with the recipient account, category label, suppression reason and
 * timestamp. Rows are written server-side by a trigger on the email send log,
 * so nothing can bypass the record.
 */
export default function AdminEmailAudit() {
  const [eventFilter, setEventFilter] = useState("all");
  const [templateFilter, setTemplateFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [search, setSearch] = useState("");

  const { data, isLoading, isFetching, refetch, error } = useQuery({
    queryKey: ["admin", "email-delivery-audit", eventFilter, fromDate, toDate],
    queryFn: async (): Promise<AuditRow[]> => {
      let query = (supabase as any)
        .from("email_delivery_audit")
        .select(
          "id, occurred_at, event, template_name, category_label, recipient_email, recipient_user_id, message_id, reason, source",
        )
        .order("occurred_at", { ascending: false })
        .limit(2000);
      if (eventFilter !== "all") query = query.eq("event", eventFilter);
      if (fromDate) query = query.gte("occurred_at", new Date(`${fromDate}T00:00:00`).toISOString());
      if (toDate) query = query.lte("occurred_at", new Date(`${toDate}T23:59:59`).toISOString());
      const { data: rows, error: queryError } = await query;
      if (queryError) throw queryError;
      return (rows ?? []) as AuditRow[];
    },
    staleTime: 30_000,
  });

  const templates = useMemo(
    () => Array.from(new Set((data ?? []).map((r) => r.template_name))).sort(),
    [data],
  );
  const categories = useMemo(
    () => Array.from(new Set((data ?? []).map((r) => r.category_label ?? "Unclassified"))).sort(),
    [data],
  );

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (data ?? []).filter((r) => {
      if (templateFilter !== "all" && r.template_name !== templateFilter) return false;
      if (categoryFilter !== "all" && (r.category_label ?? "Unclassified") !== categoryFilter) return false;
      if (!term) return true;
      return (
        r.template_name.toLowerCase().includes(term) ||
        r.recipient_email.toLowerCase().includes(term) ||
        (r.reason ?? "").toLowerCase().includes(term)
      );
    });
  }, [data, search, templateFilter, categoryFilter]);

  const exportCsv = () => {
    if (rows.length === 0) {
      toast.info("Nothing to export for these filters");
      return;
    }
    const body = rows.map((r) => CSV_COLUMNS.map((c) => csvCell(r[c.key])).join(","));
    const csv = [CSV_COLUMNS.map((c) => csvCell(c.header)).join(","), ...body].join("\r\n");
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `email-delivery-audit-${format(new Date(), "yyyy-MM-dd")}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${rows.length} rows`);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Email delivery audit"
        description="Every email Gradr queued, sent, suppressed or dry-ran — with recipient, category and reason."
      />

      <EmailPipelineAlertsCard />
      <EmailWeeklyReportCard />
      <EmailRetentionCard />

      <Card className="p-4 elev-1 space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="audit-from">From</Label>
            <Input id="audit-from" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="audit-to">To</Label>
            <Input id="audit-to" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="audit-template">Template id</Label>
            <Select value={templateFilter} onValueChange={setTemplateFilter}>
              <SelectTrigger id="audit-template">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All templates</SelectItem>
                {templates.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="audit-category">Category label</Label>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger id="audit-category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Input
            placeholder="Search template, recipient or reason…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
            aria-label="Search delivery audit"
          />
          <Select value={eventFilter} onValueChange={setEventFilter}>
            <SelectTrigger className="w-44" aria-label="Filter by event">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All events</SelectItem>
              <SelectItem value="queued">Queued</SelectItem>
              <SelectItem value="sent">Sent</SelectItem>
              <SelectItem value="suppressed">Suppressed</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="dry_run">Dry run</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={() => refetch()} loading={isFetching}>
            <RefreshCw className="h-4 w-4" aria-hidden="true" /> Refresh
          </Button>
          <Button variant="outline" onClick={exportCsv}>
            <Download className="h-4 w-4" aria-hidden="true" /> Export CSV
          </Button>
          <span className="text-caption text-muted-foreground">{rows.length} rows match</span>
        </div>
      </Card>

      {error && (
        <AdminErrorState
          error={error}
          resource="the email delivery audit"
          onRetry={() => refetch()}
          isRetrying={isFetching}
        />
      )}

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : rows.length === 0 ? (
        <Card className="p-8 text-center elev-1">
          <ScrollText className="h-6 w-6 mx-auto text-muted-foreground" aria-hidden="true" />
          <p className="text-body-sm mt-2">No delivery events recorded yet.</p>
        </Card>
      ) : (
        <Card className="p-0 overflow-x-auto elev-1">
          <table className="w-full text-body-sm">
            <caption className="sr-only">Email delivery audit log</caption>
            <thead className="bg-surface-muted text-caption text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-2 text-left font-medium">When</th>
                <th scope="col" className="px-4 py-2 text-left font-medium">Event</th>
                <th scope="col" className="px-4 py-2 text-left font-medium">Template</th>
                <th scope="col" className="px-4 py-2 text-left font-medium">Category</th>
                <th scope="col" className="px-4 py-2 text-left font-medium">Recipient</th>
                <th scope="col" className="px-4 py-2 text-left font-medium">Account</th>
                <th scope="col" className="px-4 py-2 text-left font-medium">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-2 whitespace-nowrap text-caption text-muted-foreground">
                    {format(new Date(r.occurred_at), "d MMM yyyy HH:mm")}
                  </td>
                  <td className="px-4 py-2">
                    <Badge variant={EVENT_VARIANT[r.event] ?? "outline"}>{r.event}</Badge>
                  </td>
                  <td className="px-4 py-2"><code className="text-code">{r.template_name}</code></td>
                  <td className="px-4 py-2 text-caption">{r.category_label ?? "Unclassified"}</td>
                  <td className="px-4 py-2 text-caption">{r.recipient_email}</td>
                  <td className="px-4 py-2 text-caption text-muted-foreground">
                    {r.recipient_user_id ? `${r.recipient_user_id.slice(0, 8)}…` : "—"}
                  </td>
                  <td className="px-4 py-2 text-caption text-muted-foreground">{r.reason ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
