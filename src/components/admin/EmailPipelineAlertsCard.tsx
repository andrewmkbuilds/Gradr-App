import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ds/Button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

interface AlertRow {
  id: string;
  event: string;
  stage: string;
  template_name: string;
  category_label: string | null;
  reason: string | null;
  recipients: string[] | null;
  recipient_count: number;
  occurrence_count: number;
  first_occurred_at: string;
  last_occurred_at: string;
  resolved_at: string | null;
}

/**
 * Delivery failure alerts.
 *
 * Every failed, dead-lettered, bounced, complained or suppressed delivery
 * raises (or increments) an alert server-side, carrying the suppression /
 * failure reason and the affected recipient addresses. Admins also receive an
 * in-app notification the first time each distinct alert opens.
 */
export function EmailPipelineAlertsCard() {
  const [showResolved, setShowResolved] = useState(false);
  const queryClient = useQueryClient();

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["admin", "email-pipeline-alerts", showResolved],
    queryFn: async (): Promise<AlertRow[]> => {
      type AlertsQuery = Promise<{ data: unknown; error: unknown }> & {
        order: (col: string, opts: { ascending: boolean }) => AlertsQuery;
        limit: (n: number) => AlertsQuery;
        is: (col: string, val: null) => AlertsQuery;
      };
      let query = (
        supabase as unknown as {
          from: (table: string) => { select: (cols: string) => AlertsQuery };
        }
      )
        .from("email_pipeline_alerts")
        .select(
          "id, event, stage, template_name, category_label, reason, recipients, recipient_count, occurrence_count, first_occurred_at, last_occurred_at, resolved_at",
        )
        .order("last_occurred_at", { ascending: false })
        .limit(100);
      if (!showResolved) query = query.is("resolved_at", null);
      const { data: rows, error } = await query;
      if (error) throw error;
      return (rows ?? []) as AlertRow[];
    },
    staleTime: 15_000,
  });

  const resolve = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (
        supabase as unknown as { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ error: unknown }> }
      ).rpc("admin_resolve_email_alert", { _alert_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Alert resolved");
      queryClient.invalidateQueries({ queryKey: ["admin", "email-pipeline-alerts"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Could not resolve alert"),
  });

  const alerts = data ?? [];

  return (
    <Card className="p-5 elev-1 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-body-sm font-semibold flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            Delivery failure alerts
          </h2>
          <p className="text-caption text-muted-foreground mt-1">
            Raised whenever the pipeline cannot enqueue or send a template — with the suppression or failure reason
            and the recipients it affected.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={() => setShowResolved((v) => !v)}>
            {showResolved ? "Open only" : "Include resolved"}
          </Button>
          <Button variant="outline" onClick={() => refetch()} loading={isFetching}>
            <RefreshCw className="h-4 w-4" aria-hidden="true" /> Refresh
          </Button>
        </div>
      </div>

      {isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : alerts.length === 0 ? (
        <div className="rounded-control border border-border/60 p-6 text-center">
          <CheckCircle2 className="h-5 w-5 mx-auto text-muted-foreground" aria-hidden="true" />
          <p className="text-body-sm mt-2">No delivery failures recorded.</p>
        </div>
      ) : (
        <ul className="divide-y divide-border/60 rounded-control border border-border/60">
          {alerts.map((a) => (
            <li key={a.id} className="p-3 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={a.resolved_at ? "outline" : "destructive"}>{a.event}</Badge>
                <code className="text-code">{a.template_name}</code>
                <span className="text-caption text-muted-foreground">{a.category_label ?? "Unclassified"}</span>
                <span className="text-caption text-muted-foreground">
                  {a.occurrence_count}× · last {formatDistanceToNow(new Date(a.last_occurred_at), { addSuffix: true })}
                </span>
                <span className="ml-auto flex items-center gap-2">
                  {a.resolved_at ? (
                    <Badge variant="secondary">Resolved</Badge>
                  ) : (
                    <Button
                      variant="outline"
                      onClick={() => resolve.mutate(a.id)}
                      loading={resolve.isPending && resolve.variables === a.id}
                    >
                      Resolve
                    </Button>
                  )}
                </span>
              </div>
              <p className="text-body-sm">{a.reason ?? "No reason reported"}</p>
              <p className="text-caption text-muted-foreground">
                Affected recipients ({a.recipient_count}): {(a.recipients ?? []).slice(0, 10).join(", ") || "—"}
                {(a.recipients?.length ?? 0) > 10 ? " …" : ""}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export default EmailPipelineAlertsCard;
