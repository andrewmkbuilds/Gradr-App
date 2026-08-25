import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { AlertTriangle, MailCheck, MailX, RefreshCw, Send, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ds/Button";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Weekly email report.
 *
 * A pg_cron job stores a 7-day snapshot every Monday; this card shows the
 * stored snapshot alongside a live rolling-7-day view so an admin can see both
 * "what the report said" and "what is true right now".
 */

export interface WeeklyReport {
  period_start: string;
  period_end: string;
  totals: { queued: number; sent: number; suppressed: number; failed: number; recipients: number };
  by_template: { template_name: string; category_label: string; sent: number; queued: number; suppressed: number; failed: number }[];
  suppression_reasons: { reason: string; count: number }[];
  marketing_shaped: { template_name: string; event: string; count: number }[];
}

interface ReportResponse {
  live: WeeklyReport;
  snapshot: WeeklyReport | null;
  snapshot_generated_at: string | null;
}

export function useEmailWeeklyReport() {
  return useQuery({
    queryKey: ["admin", "email-weekly-report"],
    queryFn: async (): Promise<ReportResponse> => {
      const { data, error } = await (supabase as any).rpc("admin_email_weekly_report");
      if (error) throw error;
      return data as ReportResponse;
    },
    staleTime: 60_000,
  });
}

function Stat({ label, value, icon: Icon }: { label: string; value: number; icon: typeof Send }) {
  return (
    <div className="rounded-control border border-border/60 p-3">
      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5" aria-hidden="true" /> {label}
      </p>
      <p className="text-2xl font-semibold mt-1">{value}</p>
    </div>
  );
}

export function EmailWeeklyReportCard({ compact = false }: { compact?: boolean }) {
  const { data, isLoading, refetch, isFetching, error } = useEmailWeeklyReport();

  if (isLoading) return <Skeleton className="h-48 w-full" />;

  if (error) {
    return (
      <Card className="p-4 elev-1">
        <p className="text-sm text-destructive">Weekly email report unavailable.</p>
        <p className="text-xs text-muted-foreground mt-1">{(error as Error).message}</p>
      </Card>
    );
  }

  const report = data?.live;
  if (!report) return null;
  const totals = report.totals;
  const marketing = report.marketing_shaped ?? [];

  return (
    <Card className="p-5 elev-1 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Weekly email report</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Rolling 7 days.{" "}
            {data?.snapshot_generated_at
              ? `Automated snapshot ${formatDistanceToNow(new Date(data.snapshot_generated_at))} ago.`
              : "Automated snapshot runs every Monday 06:00 UTC."}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} loading={isFetching}>
          <RefreshCw className="h-4 w-4" aria-hidden="true" /> Refresh
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="Queued" value={totals.queued} icon={Send} />
        <Stat label="Sent" value={totals.sent} icon={MailCheck} />
        <Stat label="Suppressed" value={totals.suppressed} icon={MailX} />
        <Stat label="Failed" value={totals.failed} icon={AlertTriangle} />
        <Stat label="Recipients" value={totals.recipients} icon={Users} />
      </div>

      <div
        className={
          marketing.length > 0
            ? "rounded-control border border-destructive/40 p-3"
            : "rounded-control border border-border/60 p-3"
        }
      >
        <p className="text-sm font-medium flex items-center gap-2">
          {marketing.length > 0 && <AlertTriangle className="h-4 w-4 text-destructive" aria-hidden="true" />}
          Marketing-shaped templates
        </p>
        {marketing.length === 0 ? (
          <p className="text-xs text-muted-foreground mt-1">
            None in the last 7 days — every send mapped to a registered transactional template.
          </p>
        ) : (
          <ul className="mt-2 space-y-1 text-xs">
            {marketing.map((m) => (
              <li key={`${m.template_name}-${m.event}`} className="flex items-center gap-2">
                <code className="text-code">{m.template_name}</code>
                <Badge variant="destructive">{m.event}</Badge>
                <span className="text-muted-foreground">{m.count}×</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {!compact && (
        <>
          <div>
            <p className="text-sm font-medium mb-2">By template</p>
            {report.by_template.length === 0 ? (
              <p className="text-xs text-muted-foreground">No email activity in the last 7 days.</p>
            ) : (
              <div className="divide-y divide-border/60 rounded-control border border-border/60">
                {report.by_template.map((t) => (
                  <div key={t.template_name} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <code className="text-code">{t.template_name}</code>
                      <Badge variant="outline">{t.category_label}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t.sent} sent · {t.queued} queued · {t.suppressed} suppressed · {t.failed} failed
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <p className="text-sm font-medium mb-2">Why sends were suppressed</p>
            {report.suppression_reasons.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nothing suppressed in the last 7 days.</p>
            ) : (
              <ul className="space-y-1 text-xs text-muted-foreground">
                {report.suppression_reasons.map((r) => (
                  <li key={r.reason}>
                    {r.reason} — {r.count}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </Card>
  );
}

export default EmailWeeklyReportCard;
