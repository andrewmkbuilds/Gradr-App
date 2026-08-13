/**
 * CSP violation trend + drill-down + incident export.
 *
 * The alert cron tells you *that* something changed; this panel answers the
 * follow-up questions an auditor actually asks: when did it start, which
 * directive/origin pair is responsible, what did the browser actually report,
 * and which build was live at the time.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Download, FileJson, Loader2, Sparkles, Table2 } from "lucide-react";
import { toast } from "sonner";
import { invokeFunction } from "@/lib/invokeFunction";
import { downloadCsv, downloadJson } from "@/lib/exportFile";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Combo {
  key: string;
  directive: string;
  blockedOrigin: string;
  recent: number;
  total: number;
  baselineRate: number;
  firstSeen: string;
  lastSeen: string;
  samplePath: string | null;
  surfaces: string[];
  multiple?: number;
}

interface Bucket {
  date: string;
  total: number;
  critical: number;
  newCombos: number;
  byDirective: Record<string, number>;
}

interface Timeseries {
  days: number;
  buckets: Bucket[];
  combos: Combo[];
  spikes: Combo[];
  newCombos: Combo[];
  windowHours: number;
  generatedAt: string;
}

interface ReportRow {
  id?: string;
  created_at: string;
  effective_directive?: string | null;
  violated_directive?: string | null;
  blocked_uri?: string | null;
  blocked_origin?: string | null;
  document_path?: string | null;
  document_uri?: string | null;
  source_file?: string | null;
  line_number?: number | null;
  status_code?: number | null;
  disposition?: string | null;
  script_sample?: string | null;
  user_agent?: string | null;
}

interface IncidentBundle {
  generatedAt: string;
  days: number;
  build: Record<string, string | null>;
  policy: { enforced: boolean; mode: string; candidate: string };
  readiness: { ready: boolean; cleanDays: number; requiredCleanDays: number; summary: string };
  totals: { reports: number; recent: number; combos: number };
  combos: Combo[];
  spikes: Combo[];
  newCombos: Combo[];
  reports: ReportRow[];
}

const when = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—";

const shortDay = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric" });

export default function CspInsightsPanel() {
  const [days, setDays] = useState(14);
  const [selected, setSelected] = useState<Combo | null>(null);
  const [ticket, setTicket] = useState({ prUrl: "", commit: "", note: "" });
  const [exporting, setExporting] = useState<"json" | "csv" | null>(null);

  const series = useQuery({
    queryKey: ["csp-timeseries", days],
    queryFn: async () => {
      const { data, error } = await invokeFunction<Timeseries>("csp-alerts", {
        body: { action: "timeseries", days },
      });
      if (error) throw error;
      return data!;
    },
  });

  const drill = useQuery({
    queryKey: ["csp-combo", selected?.key, days],
    enabled: !!selected,
    queryFn: async () => {
      const { data, error } = await invokeFunction<{ reports: ReportRow[]; total: number }>(
        "csp-alerts",
        { body: { action: "combo", key: selected!.key, days } },
      );
      if (error) throw error;
      return data!;
    },
  });

  const chartData = useMemo(
    () =>
      (series.data?.buckets ?? []).map((b) => ({
        ...b,
        label: shortDay(b.date),
        nonCritical: Math.max(0, b.total - b.critical),
      })),
    [series.data],
  );

  const newKeys = useMemo(
    () => new Set((series.data?.newCombos ?? []).map((c) => c.key)),
    [series.data],
  );
  const spikeKeys = useMemo(
    () => new Set((series.data?.spikes ?? []).map((c) => c.key)),
    [series.data],
  );

  async function fetchIncident(): Promise<IncidentBundle> {
    const { data, error } = await invokeFunction<IncidentBundle>("csp-alerts", {
      body: { action: "incident", days },
    });
    if (error) throw error;
    return data!;
  }

  async function exportIncident(format: "json" | "csv") {
    setExporting(format);
    try {
      const bundle = await fetchIncident();
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      const build: Record<string, string | null> = { ...bundle.build };
      const meta = {
        ...build,
        ticketPullRequest: ticket.prUrl || null,
        ticketCommit: ticket.commit || null,
        analystNote: ticket.note || null,
      };
      if (format === "json") {
        downloadJson(`csp-incident-${stamp}.json`, { ...bundle, ticket: meta });
      } else {
        // One row per combo, with the build/ticket provenance repeated so the
        // CSV stands alone when it is pasted into a tracker.
        const rows = bundle.combos.map((c) => ({
          directive: c.directive,
          blocked_origin: c.blockedOrigin,
          reports_window: String(c.recent),
          reports_total: String(c.total),
          baseline_rate: String(c.baselineRate),
          spike: bundle.spikes.some((s) => s.key === c.key) ? "yes" : "no",
          new_combo: bundle.newCombos.some((n) => n.key === c.key) ? "yes" : "no",
          critical_surfaces: c.surfaces.join(" "),
          sample_path: c.samplePath ?? "",
          first_seen: c.firstSeen,
          last_seen: c.lastSeen,
          policy_mode: bundle.policy.mode,
          readiness: bundle.readiness.summary,
          generated_at: bundle.generatedAt,
          repository: build["repository"] ?? "",
          commit_sha: build["commitSha"] ?? "",
          commit_url: build["commitUrl"] ?? "",
          workflow_run_url: build["workflowRunUrl"] ?? "",
          ticket_pull_request: meta.ticketPullRequest ?? "",
          ticket_commit: meta.ticketCommit ?? "",
          analyst_note: meta.analystNote ?? "",
        }));
        const columns = Object.keys(rows[0] ?? {}) as (keyof (typeof rows)[number])[];
        downloadCsv(`csp-incident-${stamp}.csv`, rows, columns);
      }
      toast.success(`Incident report exported as ${format.toUpperCase()}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Export failed");
    } finally {
      setExporting(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Violation trend</p>
            <p className="text-xs text-muted-foreground">
              Daily report volume with critical-surface breakdown. Bars mark directive/origin pairs
              seen for the first time that day.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {[7, 14, 30].map((d) => (
              <Button
                key={d}
                size="sm"
                variant={days === d ? "default" : "outline"}
                onClick={() => setDays(d)}
              >
                {d}d
              </Button>
            ))}
          </div>
        </div>

        {series.isLoading ? (
          <p className="mt-6 text-sm text-muted-foreground">Loading trend…</p>
        ) : (
          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <div className="h-56 lg:col-span-2">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 12,
                      fontSize: 12,
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Area
                    type="monotone"
                    dataKey="critical"
                    name="Critical surface"
                    stackId="1"
                    stroke="hsl(var(--destructive))"
                    fill="hsl(var(--destructive) / 0.35)"
                  />
                  <Area
                    type="monotone"
                    dataKey="nonCritical"
                    name="Other"
                    stackId="1"
                    stroke="hsl(var(--primary))"
                    fill="hsl(var(--primary) / 0.25)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 12,
                      fontSize: 12,
                    }}
                  />
                  <Bar
                    dataKey="newCombos"
                    name="New pairs"
                    fill="hsl(var(--accent))"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>

      {/* Combo table — click through to the raw browser reports. */}
      <div className="overflow-hidden rounded-xl border border-border">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">Directive → origin</th>
              <th className="px-4 py-2 font-medium">Window</th>
              <th className="px-4 py-2 font-medium">Total</th>
              <th className="px-4 py-2 font-medium">Baseline</th>
              <th className="px-4 py-2 font-medium">Last seen</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {(series.data?.combos ?? []).length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  No violations in the last {days} days.
                </td>
              </tr>
            )}
            {(series.data?.combos ?? []).map((combo) => (
              <tr key={combo.key} className="border-t border-border align-top">
                <td className="px-4 py-2">
                  <p className="break-all font-mono text-xs">
                    {combo.directive} → {combo.blockedOrigin}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {spikeKeys.has(combo.key) && <Badge variant="destructive">spike</Badge>}
                    {newKeys.has(combo.key) && (
                      <Badge className="gap-1">
                        <Sparkles className="h-3 w-3" /> new
                      </Badge>
                    )}
                    {combo.surfaces.map((s) => (
                      <Badge key={s} variant="outline">
                        {s}
                      </Badge>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-2 tabular-nums">{combo.recent}</td>
                <td className="px-4 py-2 tabular-nums">{combo.total}</td>
                <td className="px-4 py-2 tabular-nums text-muted-foreground">{combo.baselineRate}</td>
                <td className="px-4 py-2 text-xs text-muted-foreground">{when(combo.lastSeen)}</td>
                <td className="px-4 py-2 text-right">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setSelected(selected?.key === combo.key ? null : combo)}
                  >
                    {selected?.key === combo.key ? "Hide" : "Payloads"}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected && (
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="break-all font-mono text-xs">
              {selected.directive} → {selected.blockedOrigin}
            </p>
            <Button
              size="sm"
              variant="outline"
              disabled={!drill.data?.reports?.length}
              onClick={() =>
                downloadJson(
                  `csp-reports-${selected.directive}-${Date.now()}.json`,
                  drill.data?.reports ?? [],
                )
              }
            >
              <Download className="mr-1 h-3.5 w-3.5" /> Payloads
            </Button>
          </div>
          {drill.isLoading ? (
            <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading report payloads…
            </p>
          ) : (
            <ul className="mt-3 max-h-80 space-y-2 overflow-auto">
              {(drill.data?.reports ?? []).map((report, i) => (
                <li
                  key={report.id ?? `${report.created_at}-${i}`}
                  className="rounded-lg border border-border p-3 text-xs"
                >
                  <p className="text-muted-foreground">{when(report.created_at)}</p>
                  <p className="mt-1 break-all font-mono">
                    blocked: {report.blocked_uri ?? report.blocked_origin ?? "—"}
                  </p>
                  <p className="break-all font-mono text-muted-foreground">
                    page: {report.document_path ?? report.document_uri ?? "—"}
                    {report.source_file ? ` · ${report.source_file}:${report.line_number ?? 0}` : ""}
                  </p>
                  {report.script_sample && (
                    <pre className="mt-1 overflow-auto rounded bg-muted p-2 font-mono text-[11px]">
                      {report.script_sample}
                    </pre>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Incident export: evidence + provenance in one file. */}
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-sm font-medium">Export incident report</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Bundles the violation evidence, enforcement readiness and build provenance. Add a PR or
          commit reference and it travels with the export into your tracker.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div>
            <Label className="text-xs">PR / ticket URL</Label>
            <Input
              value={ticket.prUrl}
              onChange={(e) => setTicket({ ...ticket, prUrl: e.target.value })}
              placeholder="https://github.com/org/repo/pull/123"
            />
          </div>
          <div>
            <Label className="text-xs">Commit SHA</Label>
            <Input
              value={ticket.commit}
              onChange={(e) => setTicket({ ...ticket, commit: e.target.value })}
              placeholder="a1b2c3d"
            />
          </div>
          <div>
            <Label className="text-xs">Note</Label>
            <Input
              value={ticket.note}
              onChange={(e) => setTicket({ ...ticket, note: e.target.value })}
              placeholder="Context for the reviewer"
            />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" disabled={exporting !== null} onClick={() => exportIncident("json")}>
            {exporting === "json" ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <FileJson className="mr-1 h-3.5 w-3.5" />
            )}
            JSON
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={exporting !== null}
            onClick={() => exportIncident("csv")}
          >
            {exporting === "csv" ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Table2 className="mr-1 h-3.5 w-3.5" />
            )}
            CSV
          </Button>
        </div>
      </div>
    </div>
  );
}
