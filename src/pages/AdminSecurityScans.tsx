import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileJson,
  GitCommit,
  Loader2,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { invokeFunction } from "@/lib/invokeFunction";
import { downloadCsv, downloadJson } from "@/lib/exportFile";

interface ScanRun {
  id: string;
  scanned_at: string;
  source: string;
  finding_count: number;
  internal_ids: string[];
  counts_by_level: Record<string, number>;
  commit_sha: string | null;
  commit_url: string | null;
  branch: string | null;
  pr_number: number | null;
  pr_url: string | null;
  notes: string | null;
}

interface ExportRow extends Record<string, unknown> {
  run_id: string;
  scanned_at: string;
  internal_id: string;
  name: string;
  level: string;
  scanner: string;
  commit_sha: string;
  pr_number: string;
}

interface EndpointRate {
  endpoint: string;
  calls: number;
  errors: number;
  rate: number;
  severity: "critical" | "warning" | "ok";
  warnRate: number;
  criticalRate: number;
}

interface AlertsPayload {
  windowMinutes: number;
  thresholds: {
    edge: { warnRate: number; criticalRate: number; minSamples: number };
    permissionDenied: { warnCount: number; criticalCount: number };
  };
  endpoints: EndpointRate[];
  permissionDenied: {
    total: number;
    anonHasRole: number;
    severity: "critical" | "warning" | "ok";
    byRoute: { route: string; count: number }[];
    recent: {
      route: string;
      authenticated: boolean;
      mentions_has_role: boolean;
      message: string | null;
      created_at: string;
    }[];
  };
}

const EXPORT_COLUMNS = [
  "scanned_at",
  "internal_id",
  "name",
  "level",
  "scanner",
  "description",
  "commit_sha",
  "commit_url",
  "branch",
  "pr_number",
  "pr_url",
  "run_id",
] as const;

const pct = (n: number) => `${(n * 100).toFixed(n < 0.01 ? 2 : 1)}%`;

function severityBadge(severity: "critical" | "warning" | "ok") {
  if (severity === "critical")
    return <Badge className="bg-destructive/10 text-destructive">Critical</Badge>;
  if (severity === "warning") return <Badge variant="accentSoft">Warning</Badge>;
  return <Badge className="bg-success/10 text-success">Healthy</Badge>;
}

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await invokeFunction<T>("security-scans", { body });
  if (error) throw error;
  return data as T;
}

/** Admin ledger of security scans plus live reliability/permission alerts. */
export default function AdminSecurityScans() {
  const [exporting, setExporting] = useState(false);
  const [windowMinutes, setWindowMinutes] = useState(60);

  const runs = useQuery({
    queryKey: ["security-scan-runs"],
    queryFn: () => call<{ runs: ScanRun[] }>({ action: "list", limit: 50 }),
  });

  const alerts = useQuery({
    queryKey: ["security-alerts", windowMinutes],
    refetchInterval: 60_000,
    queryFn: () => call<AlertsPayload>({ action: "alerts", windowMinutes }),
  });

  const runExport = async (format: "json" | "csv", runId?: string) => {
    setExporting(true);
    try {
      const payload = await call<{ run: ScanRun; rows: ExportRow[] }>({
        action: "export",
        ...(runId ? { runId } : {}),
      });
      const stamp = payload.run.scanned_at.slice(0, 10);
      const sha = (payload.run.commit_sha ?? "nocommit").slice(0, 7);
      if (format === "json") {
        downloadJson(`gradr-security-findings-${stamp}-${sha}.json`, {
          run: payload.run,
          findings: payload.rows,
        });
      } else {
        downloadCsv(
          `gradr-security-findings-${stamp}-${sha}.csv`,
          payload.rows,
          EXPORT_COLUMNS as unknown as (keyof ExportRow)[],
        );
      }
      toast.success("Findings exported");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  const breaches = (alerts.data?.endpoints ?? []).filter((e) => e.severity !== "ok");
  const pd = alerts.data?.permissionDenied;

  return (
    <div className="space-y-8 p-6 max-w-7xl mx-auto">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-primary" />
            Security scans &amp; alerts
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Every scan run, the findings it saw, and which commit was deployed at the time.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => runExport("json")} disabled={exporting}>
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileJson className="h-4 w-4" />}
            <span className="ml-2">Latest JSON</span>
          </Button>
          <Button variant="outline" onClick={() => runExport("csv")} disabled={exporting}>
            <Download className="h-4 w-4" />
            <span className="ml-2">Latest CSV</span>
          </Button>
        </div>
      </header>

      {/* Alert dashboard */}
      <section className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold text-foreground">Live alert thresholds</h2>
          <div className="inline-flex rounded-full border border-border p-1">
            {[60, 360, 1440].map((m) => (
              <button
                key={m}
                onClick={() => setWindowMinutes(m)}
                aria-pressed={windowMinutes === m}
                className={`px-3 py-1 text-xs rounded-full transition-colors ${
                  windowMinutes === m
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {m === 60 ? "1h" : m === 360 ? "6h" : "24h"}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Card className="p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-foreground">Backend error rate</h3>
              {severityBadge(
                breaches.some((b) => b.severity === "critical")
                  ? "critical"
                  : breaches.length
                    ? "warning"
                    : "ok",
              )}
            </div>
            {alerts.isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : (alerts.data?.endpoints ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No backend traffic in this window.</p>
            ) : (
              <ul className="space-y-2">
                {(alerts.data?.endpoints ?? []).slice(0, 8).map((e) => (
                  <li key={e.endpoint} className="flex items-center justify-between gap-3 text-sm">
                    <span className="truncate font-mono text-xs text-muted-foreground">
                      {e.endpoint}
                    </span>
                    <span className="flex items-center gap-2 shrink-0">
                      <span
                        className={
                          e.severity === "critical"
                            ? "text-destructive"
                            : e.severity === "warning"
                              ? "text-warning"
                              : "text-muted-foreground"
                        }
                      >
                        {pct(e.rate)} of {e.calls}
                      </span>
                      {e.severity === "ok" ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                      ) : (
                        <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-xs text-muted-foreground">
              Warn at {pct(alerts.data?.thresholds.edge.warnRate ?? 0.02)}, critical at{" "}
              {pct(alerts.data?.thresholds.edge.criticalRate ?? 0.05)} (min{" "}
              {alerts.data?.thresholds.edge.minSamples ?? 20} calls).
            </p>
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-foreground">
                Permission denied (has_role)
              </h3>
              {severityBadge(pd?.severity ?? "ok")}
            </div>
            <div className="flex gap-6 mb-3">
              <div>
                <div className="text-2xl font-bold text-foreground">{pd?.total ?? 0}</div>
                <div className="text-xs text-muted-foreground">denials in window</div>
              </div>
              <div>
                <div
                  className={`text-2xl font-bold ${pd?.anonHasRole ? "text-destructive" : "text-foreground"}`}
                >
                  {pd?.anonHasRole ?? 0}
                </div>
                <div className="text-xs text-muted-foreground">signed-out has_role hits</div>
              </div>
            </div>
            {pd?.byRoute.length ? (
              <ul className="space-y-1">
                {pd.byRoute.slice(0, 6).map((r) => (
                  <li key={r.route} className="flex justify-between text-sm">
                    <span className="font-mono text-xs text-muted-foreground truncate">
                      {r.route}
                    </span>
                    <span className="text-foreground">{r.count}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                No permission errors reported — public pages are loading clean.
              </p>
            )}
          </Card>
        </div>
      </section>

      {/* Scan ledger */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">Scan history</h2>
        {runs.isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : runs.error ? (
          <Card className="p-5 text-sm text-destructive">
            {(runs.error as Error).message}
          </Card>
        ) : (runs.data?.runs ?? []).length === 0 ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">
            No scan runs recorded yet.
          </Card>
        ) : (
          <div className="space-y-3">
            {(runs.data?.runs ?? []).map((run) => (
              <Card key={run.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-foreground">
                        {new Date(run.scanned_at).toLocaleString()}
                      </span>
                      <Badge variant="outline">{run.source}</Badge>
                      {run.finding_count === 0 ? (
                        <Badge className="bg-success/10 text-success">Clean</Badge>
                      ) : (
                        <Badge className="bg-warning/10 text-warning">
                          {run.finding_count} finding{run.finding_count === 1 ? "" : "s"}
                        </Badge>
                      )}
                    </div>
                    {run.internal_ids.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {run.internal_ids.map((id) => (
                          <span
                            key={id}
                            className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground"
                          >
                            {id}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <GitCommit className="h-3 w-3" />
                        {run.commit_url ? (
                          <a
                            href={run.commit_url}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="underline"
                          >
                            {(run.commit_sha ?? "unknown").slice(0, 7)}
                          </a>
                        ) : (
                          (run.commit_sha ?? "no commit recorded").slice(0, 7)
                        )}
                      </span>
                      {run.branch && <span>branch {run.branch}</span>}
                      {run.pr_number && (
                        <a
                          href={run.pr_url ?? "#"}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="underline"
                        >
                          PR #{run.pr_number}
                        </a>
                      )}
                    </div>
                    {run.notes && (
                      <p className="mt-2 text-xs text-muted-foreground">{run.notes}</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => runExport("json", run.id)}
                      disabled={exporting}
                    >
                      <FileJson className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => runExport("csv", run.id)}
                      disabled={exporting}
                    >
                      <Download className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <ShieldAlert className="h-4 w-4 shrink-0 text-muted-foreground" />
        CI records a run on every deploy and fails the build if a previously fixed finding
        reappears, so this ledger doubles as the remediation audit trail.
      </p>
    </div>
  );
}
