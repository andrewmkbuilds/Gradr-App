import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { RefreshCw, ScrollText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/app/PageHeader";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ds/Button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmailWeeklyReportCard } from "@/components/admin/EmailWeeklyReportCard";
import { AdminErrorState } from "@/components/admin/AdminErrorState";

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

/**
 * Delivery audit log — every queued, sent, suppressed, failed and dry-run
 * email, with the recipient account, category label, suppression reason and
 * timestamp. Rows are written server-side by a trigger on the email send log,
 * so nothing can bypass the record.
 */
export default function AdminEmailAudit() {
  const [eventFilter, setEventFilter] = useState("all");
  const [search, setSearch] = useState("");

  const { data, isLoading, isFetching, refetch, error } = useQuery({
    queryKey: ["admin", "email-delivery-audit", eventFilter],
    queryFn: async (): Promise<AuditRow[]> => {
      let query = (supabase as any)
        .from("email_delivery_audit")
        .select("id, occurred_at, event, template_name, category_label, recipient_email, recipient_user_id, message_id, reason, source")
        .order("occurred_at", { ascending: false })
        .limit(500);
      if (eventFilter !== "all") query = query.eq("event", eventFilter);
      const { data: rows, error: queryError } = await query;
      if (queryError) throw queryError;
      return (rows ?? []) as AuditRow[];
    },
    staleTime: 30_000,
  });

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return data ?? [];
    return (data ?? []).filter(
      (r) =>
        r.template_name.toLowerCase().includes(term) ||
        r.recipient_email.toLowerCase().includes(term) ||
        (r.reason ?? "").toLowerCase().includes(term),
    );
  }, [data, search]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Email delivery audit"
        description="Every email Gradr queued, sent, suppressed or dry-ran — with recipient, category and reason."
      />

      <EmailWeeklyReportCard />

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
      </div>

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
