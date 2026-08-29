import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Archive, PlayCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ds/Button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

interface RetentionSettings {
  audit_retention_days: number;
  report_retention_days: number;
  alert_retention_days: number;
  purge_enabled: boolean;
  last_purge_at: string | null;
  last_purge_result: {
    audit_deleted?: number;
    reports_deleted?: number;
    alerts_deleted?: number;
    skipped?: boolean;
  } | null;
}

/**
 * Retention policy for email audit + reporting data.
 *
 * A nightly job deletes delivery audit rows, weekly report snapshots and
 * resolved alerts older than these windows. The last run and the row counts it
 * removed are shown so the purge can be verified without leaving the admin.
 */
export function EmailRetentionCard() {
  const queryClient = useQueryClient();
  const [audit, setAudit] = useState("180");
  const [reports, setReports] = useState("365");
  const [alerts, setAlerts] = useState("90");
  const [enabled, setEnabled] = useState(true);

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "email-retention"],
    queryFn: async (): Promise<RetentionSettings | null> => {
      const { data: row, error } = await (supabase as unknown as { rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }> }).rpc(
        "admin_email_retention_settings",
      );
      if (error) throw error;
      return (row ?? null) as RetentionSettings | null;
    },
  });

  useEffect(() => {
    if (!data) return;
    setAudit(String(data.audit_retention_days));
    setReports(String(data.report_retention_days));
    setAlerts(String(data.alert_retention_days));
    setEnabled(data.purge_enabled);
  }, [data]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as unknown as { rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }> }).rpc("admin_update_email_retention", {
        _audit_retention_days: Number(audit),
        _report_retention_days: Number(reports),
        _alert_retention_days: Number(alerts),
        _purge_enabled: enabled,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Retention policy saved");
      queryClient.invalidateQueries({ queryKey: ["admin", "email-retention"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Could not save policy"),
  });

  const runNow = useMutation({
    mutationFn: async () => {
      const { data: result, error } = await (supabase as unknown as { rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }> }).rpc(
        "admin_run_email_retention_purge",
      );
      if (error) throw error;
      return result as RetentionSettings["last_purge_result"];
    },
    onSuccess: (result) => {
      if (result?.skipped) {
        toast.info("Purge is disabled — nothing was deleted");
      } else {
        toast.success(
          `Purged ${result?.audit_deleted ?? 0} audit rows, ${result?.reports_deleted ?? 0} reports, ${result?.alerts_deleted ?? 0} alerts`,
        );
      }
      queryClient.invalidateQueries({ queryKey: ["admin", "email-retention"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "email-delivery-audit"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Purge failed"),
  });

  return (
    <Card className="p-5 elev-1 space-y-4">
      <div>
        <h2 className="text-body-sm font-semibold flex items-center gap-2">
          <Archive className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          Retention policy
        </h2>
        <p className="text-caption text-muted-foreground mt-1">
          How long delivery audit rows, weekly report snapshots and resolved alerts are kept. A nightly job removes
          anything older.
        </p>
      </div>

      {isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="retention-audit">Audit log (days)</Label>
              <Input
                id="retention-audit"
                type="number"
                min={7}
                max={3650}
                value={audit}
                onChange={(e) => setAudit(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="retention-reports">Weekly reports (days)</Label>
              <Input
                id="retention-reports"
                type="number"
                min={7}
                max={3650}
                value={reports}
                onChange={(e) => setReports(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="retention-alerts">Resolved alerts (days)</Label>
              <Input
                id="retention-alerts"
                type="number"
                min={7}
                max={3650}
                value={alerts}
                onChange={(e) => setAlerts(e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Switch id="retention-enabled" checked={enabled} onCheckedChange={setEnabled} />
            <Label htmlFor="retention-enabled" className="text-body-sm">
              Purge automatically each night
            </Label>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => save.mutate()} loading={save.isPending}>
              Save policy
            </Button>
            <Button variant="outline" onClick={() => runNow.mutate()} loading={runNow.isPending}>
              <PlayCircle className="h-4 w-4" aria-hidden="true" /> Run purge now
            </Button>
          </div>

          <p className="text-caption text-muted-foreground">
            {data?.last_purge_at
              ? `Last purge ${format(new Date(data.last_purge_at), "d MMM yyyy HH:mm")} — removed ${
                  data.last_purge_result?.audit_deleted ?? 0
                } audit rows, ${data.last_purge_result?.reports_deleted ?? 0} reports, ${
                  data.last_purge_result?.alerts_deleted ?? 0
                } resolved alerts.`
              : "The purge has not run yet."}
          </p>
        </>
      )}
    </Card>
  );
}

export default EmailRetentionCard;
