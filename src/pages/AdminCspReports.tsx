import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Download, RefreshCw, ShieldAlert } from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { format, formatDistanceToNow, subHours } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/app/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ds/Button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { downloadCsvWithManifest } from "@/lib/admin/auditManifest";
import { cn } from "@/lib/utils";

/**
 * CSP report-only dashboard.
 *
 * The policy ships report-only, so every row here is something enforcement
 * *would* have blocked. Spikes are the alarm: a sudden jump against the
 * previous window usually means a new third-party script or a broken origin.
 */

interface CspReport {
  id: string;
  effective_directive: string;
  violated_directive: string | null;
  blocked_origin: string;
  document_path: string;
  script_sample: string | null;
  disposition: string;
  user_agent: string | null;
  created_at: string;
}

const COLUMNS: (keyof CspReport)[] = [
  "created_at", "effective_directive", "violated_directive", "blocked_origin",
  "document_path", "script_sample", "disposition", "user_agent", "id",
];

const WINDOWS = [
  { value: "24", label: "Last 24 hours" },
  { value: "72", label: "Last 3 days" },
  { value: "168", label: "Last 7 days" },
];

/** A window is "spiking" when it more than doubles the previous window. */
const SPIKE_FACTOR = 2;
const SPIKE_FLOOR = 10;

export default function AdminCspReports() {
  const { user } = useAuth();
  const [hours, setHours] = useState("24");
  const [exporting, setExporting] = useState(false);

  const windowMs = Number(hours) * 3600 * 1000;
  const since = useMemo(() => subHours(new Date(), Number(hours) * 2).toISOString(), [hours]);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["admin-csp-reports", hours],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("csp_violation_reports")
        .select("id, effective_directive, violated_directive, blocked_origin, document_path, script_sample, disposition, user_agent, created_at")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(2000);
      if (error) throw error;
      return (data ?? []) as unknown as CspReport[];
    },
  });

  const split = useMemo(() => {
    const cutoff = Date.now() - windowMs;
    const current: CspReport[] = [];
    const previous: CspReport[] = [];
    for (const r of data ?? []) {
      (new Date(r.created_at).getTime() >= cutoff ? current : previous).push(r);
    }
    return { current, previous };
  }, [data, windowMs]);

  const spiking = split.current.length >= SPIKE_FLOOR
    && split.current.length >= Math.max(1, split.previous.length) * SPIKE_FACTOR;

  const byDirective = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of split.current) {
      map.set(r.effective_directive, (map.get(r.effective_directive) ?? 0) + 1);
    }
    return Array.from(map, ([directive, count]) => ({ directive, count })).sort((a, b) => b.count - a.count);
  }, [split.current]);

  const byOrigin = useMemo(() => {
    const map = new Map<string, { origin: string; count: number; directives: Set<string>; last: string }>();
    for (const r of split.current) {
      const row = map.get(r.blocked_origin) ?? { origin: r.blocked_origin, count: 0, directives: new Set<string>(), last: r.created_at };
      row.count += 1;
      row.directives.add(r.effective_directive);
      if (r.created_at > row.last) row.last = r.created_at;
      map.set(r.blocked_origin, row);
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count).slice(0, 20);
  }, [split.current]);

  const series = useMemo(() => {
    const buckets = new Map<string, number>();
    for (const r of split.current) {
      const key = format(new Date(r.created_at), "MMM d HH:00");
      buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }
    return Array.from(buckets, ([t, count]) => ({ t, count })).reverse();
  }, [split.current]);

  const onExport = async () => {
    if (!split.current.length) {
      toast.error("No violations in this window.");
      return;
    }
    setExporting(true);
    try {
      const manifest = await downloadCsvWithManifest({
        basename: `gradr-csp-violations-${format(new Date(), "yyyyMMdd-HHmm")}`,
        dataset: "csp_violation_reports",
        rows: split.current as unknown as Record<string, unknown>[],
        columns: COLUMNS as string[],
        exportedBy: user?.email ?? user?.id ?? "unknown-admin",
        filters: { window_hours: Number(hours) },
      });
      toast.success(`Exported ${manifest.row_count} violations`, {
        description: `SHA-256 ${manifest.sha256.slice(0, 16)}…`,
      });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 pb-16 pt-6 sm:px-6">
      <PageHeader
        eyebrow="Trust & safety"
        title="CSP violations"
        description="Report-only Content-Security-Policy telemetry — what enforcement would block today, and where it is spiking."
        icon={<ShieldAlert className="h-5 w-5" aria-hidden="true" />}
      />

      {spiking && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" aria-hidden="true" />
          <AlertTitle>Violation spike detected</AlertTitle>
          <AlertDescription>
            {split.current.length} violations in the last {hours}h versus {split.previous.length} in the previous
            window. Check the top blocked origins below before tightening the policy.
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Select value={hours} onValueChange={setHours}>
          <SelectTrigger className="w-44" aria-label="Time window"><SelectValue /></SelectTrigger>
          <SelectContent>
            {WINDOWS.map((w) => <SelectItem key={w.value} value={w.value}>{w.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={cn("mr-2 h-4 w-4", isFetching && "animate-spin")} aria-hidden="true" /> Refresh
        </Button>
        <Button onClick={onExport} disabled={exporting}>
          <Download className="mr-2 h-4 w-4" aria-hidden="true" /> Export CSV + manifest
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { label: "This window", value: split.current.length },
          { label: "Previous window", value: split.previous.length },
          { label: "Distinct origins", value: byOrigin.length },
        ].map((s) => (
          <Card key={s.label} className="p-4">
            <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{s.label}</p>
            {isLoading ? <Skeleton className="mt-2 h-8 w-16" /> : (
              <p className="mt-1 text-3xl font-semibold tabular-nums">{s.value}</p>
            )}
          </Card>
        ))}
      </div>

      <Card className="p-4">
        <h2 className="text-sm font-semibold">Violations per hour</h2>
        <div className="mt-3 h-56">
          {isLoading ? <Skeleton className="h-full w-full" /> : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={series}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="t" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                <Bar dataKey="count" name="Violations" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <div className="border-b border-border p-4"><h2 className="text-sm font-semibold">By directive</h2></div>
          <ul className="divide-y divide-border/60">
            {byDirective.length === 0 && !isLoading && (
              <li className="px-4 py-8 text-center text-sm text-muted-foreground">No violations — the policy is clean.</li>
            )}
            {byDirective.map((d) => (
              <li key={d.directive} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span className="font-mono text-xs">{d.directive}</span>
                <Badge variant="secondary">{d.count}</Badge>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="overflow-hidden">
          <div className="border-b border-border p-4"><h2 className="text-sm font-semibold">Top blocked origins</h2></div>
          <ul className="divide-y divide-border/60">
            {byOrigin.length === 0 && !isLoading && (
              <li className="px-4 py-8 text-center text-sm text-muted-foreground">Nothing blocked in this window.</li>
            )}
            {byOrigin.map((o) => (
              <li key={o.origin} className="px-4 py-2.5 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-mono text-xs">{o.origin}</span>
                  <Badge variant="secondary">{o.count}</Badge>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {Array.from(o.directives).join(", ")} · last {formatDistanceToNow(new Date(o.last), { addSuffix: true })}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
