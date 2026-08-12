import { useMemo, useState } from "react";
import { invokeFunction } from "@/lib/invokeFunction";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Gauge,
  Info,
  Loader2,
  RefreshCw,
  Search,
  XCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useIsAdmin } from "@/hooks/useAffiliate";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type Level = "error" | "warning" | "info";
interface Alert {
  level: Level;
  title: string;
  detail: string;
}
interface LighthousePage {
  url: string;
  performance?: number | null;
  accessibility?: number | null;
  bestPractices?: number | null;
  seo?: number | null;
  lcp?: string | null;
  cls?: string | null;
  tbt?: string | null;
  error?: string;
}
interface Snapshot {
  id?: string;
  captured_at?: string;
  property?: string | null;
  clicks: number;
  impressions: number;
  ctr: number;
  avg_position: number | null;
  top_queries: { query: string; clicks: number; impressions: number; ctr: number; position: number }[];
  top_pages: { page: string; clicks: number; impressions: number; ctr: number; position: number }[];
  sitemaps: { path: string; lastSubmitted: string | null; lastDownloaded: string | null; warnings: number; errors: number }[];
  inspections: { url: string; verdict?: string; coverageState?: string | null; error?: string }[];
  lighthouse: { pages?: LighthousePage[]; fetchedAt?: string };
  alerts: Alert[];
  changes: Alert[];
}
interface MonitorResponse {
  status: string;
  snapshot: Snapshot | null;
  history?: Snapshot[];
  candidates?: string[];
  error?: string;
}

const LEVEL_STYLE: Record<Level, { icon: typeof Info; cls: string }> = {
  error: { icon: XCircle, cls: "border-destructive/40 bg-destructive/10 text-destructive" },
  warning: { icon: AlertTriangle, cls: "border-warning/40 bg-warning/10 text-warning" },
  info: { icon: Info, cls: "border-border bg-secondary text-muted-foreground" },
};

function scoreTone(v?: number | null) {
  if (typeof v !== "number") return "text-muted-foreground";
  if (v >= 90) return "text-primary";
  if (v >= 70) return "text-warning";
  return "text-destructive";
}

const fmtDate = (v?: string | null) =>
  v ? new Date(v).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-foreground">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function AlertList({ items, empty }: { items: Alert[]; empty: string }) {
  if (!items.length) {
    return <p className="rounded-xl border border-border bg-secondary/40 p-4 text-sm text-muted-foreground">{empty}</p>;
  }
  return (
    <ul className="space-y-2">
      {items.map((a, i) => {
        const { icon: Icon, cls } = LEVEL_STYLE[a.level] ?? LEVEL_STYLE.info;
        return (
          <li key={`${a.title}-${i}`} className={`flex gap-3 rounded-xl border p-3 text-sm ${cls}`}>
            <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <div>
              <p className="font-medium">{a.title}</p>
              <p className="opacity-80">{a.detail}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export default function AdminSeoMonitor() {
  const { data: isAdmin, isLoading: loadingAdmin } = useIsAdmin();
  const qc = useQueryClient();
  const [selectedSiteUrl, setSelectedSiteUrl] = useState<string | undefined>();

  const call = async (refresh: boolean): Promise<MonitorResponse> => {
    const { data, error } = await invokeFunction("seo-monitor", {
      body: { refresh, selectedSiteUrl },
    });
    if (error) throw error;
    return data as MonitorResponse;
  };

  const { data, isLoading, error } = useQuery({
    queryKey: ["seo-monitor", selectedSiteUrl],
    enabled: !!isAdmin,
    queryFn: () => call(false),
    staleTime: 60_000,
  });

  const refresh = useMutation({
    mutationFn: () => call(true),
    onSuccess: (res) => {
      qc.setQueryData(["seo-monitor", selectedSiteUrl], res);
      const problems = (res.snapshot?.changes ?? []).length;
      toast.success(problems ? `Scan complete — ${problems} change(s) detected` : "Scan complete — nothing changed");
    },
    onError: (e: Error) => toast.error(e.message || "SEO scan failed"),
  });

  const snapshot = data?.snapshot ?? null;
  const history = data?.history ?? [];
  const lighthousePages = useMemo(() => snapshot?.lighthouse?.pages ?? [], [snapshot]);

  if (loadingAdmin) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!isAdmin) return null;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-foreground">
            <Activity className="h-6 w-6 text-primary" aria-hidden />
            SEO Monitor
          </h1>
          <p className="text-sm text-muted-foreground">
            Search Console performance, indexing and Lighthouse scores for gradr.me — with alerts when rankings or errors change.
          </p>
        </div>
        <Button onClick={() => refresh.mutate()} disabled={refresh.isPending}>
          {refresh.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          Run scan
        </Button>
      </header>

      {data?.status === "selection_required" && (
        <div className="space-y-2 rounded-xl border border-border bg-card p-4">
          <p className="text-sm text-foreground">Choose the Search Console property to monitor:</p>
          {data.candidates?.map((c) => (
            <Button key={c} variant="outline" size="sm" className="mr-2" onClick={() => setSelectedSiteUrl(c)}>
              {c}
            </Button>
          ))}
        </div>
      )}

      {error && (
        <p className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          {(error as Error).message}
        </p>
      )}

      {isLoading ? (
        <div className="flex min-h-[30vh] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !snapshot ? (
        <p className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
          No scan recorded yet. Run a scan to capture the first Search Console + Lighthouse baseline.
        </p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            Last scan {fmtDate(snapshot.captured_at)}
            {snapshot.property ? ` · ${snapshot.property}` : ""}
          </p>

          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Clicks (28d)" value={String(snapshot.clicks)} />
            <Stat label="Impressions (28d)" value={String(snapshot.impressions)} />
            <Stat label="CTR" value={`${(Number(snapshot.ctr) * 100).toFixed(1)}%`} />
            <Stat
              label="Avg position"
              value={snapshot.avg_position === null ? "—" : Number(snapshot.avg_position).toFixed(1)}
              sub="lower is better"
            />
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">Changes since the last scan</h2>
            <AlertList items={snapshot.changes ?? []} empty="Nothing changed since the previous scan." />
          </section>

          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
              <Gauge className="h-5 w-5 text-primary" aria-hidden /> Lighthouse (mobile)
            </h2>
            <div className="grid gap-3 md:grid-cols-2">
              {lighthousePages.length === 0 && (
                <p className="text-sm text-muted-foreground">No Lighthouse data in this scan.</p>
              )}
              {lighthousePages.map((p) => (
                <div key={p.url} className="rounded-xl border border-border bg-card p-4">
                  <p className="truncate text-sm font-medium text-foreground">{p.url}</p>
                  {p.error ? (
                    <p className="mt-2 text-sm text-muted-foreground">Audit unavailable ({p.error}).</p>
                  ) : (
                    <>
                      <div className="mt-3 grid grid-cols-4 gap-2 text-center">
                        {([
                          ["Perf", p.performance],
                          ["A11y", p.accessibility],
                          ["Best", p.bestPractices],
                          ["SEO", p.seo],
                        ] as const).map(([label, v]) => (
                          <div key={label}>
                            <p className={`text-xl font-semibold ${scoreTone(v)}`}>{v ?? "—"}</p>
                            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
                          </div>
                        ))}
                      </div>
                      <p className="mt-3 text-xs text-muted-foreground">
                        LCP {p.lcp ?? "—"} · CLS {p.cls ?? "—"} · TBT {p.tbt ?? "—"}
                      </p>
                    </>
                  )}
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">Open issues</h2>
            <AlertList items={snapshot.alerts ?? []} empty="No indexing, sitemap or performance issues detected." />
          </section>

          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
              <Search className="h-5 w-5 text-primary" aria-hidden /> Top queries
            </h2>
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-sm">
                <thead className="bg-secondary/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="p-3">Query</th>
                    <th className="p-3">Clicks</th>
                    <th className="p-3">Impr.</th>
                    <th className="p-3">CTR</th>
                    <th className="p-3">Pos.</th>
                  </tr>
                </thead>
                <tbody>
                  {(snapshot.top_queries ?? []).map((r) => (
                    <tr key={r.query} className="border-t border-border">
                      <td className="p-3 text-foreground">{r.query}</td>
                      <td className="p-3">{r.clicks}</td>
                      <td className="p-3">{r.impressions}</td>
                      <td className="p-3">{(r.ctr * 100).toFixed(1)}%</td>
                      <td className="p-3">{r.position.toFixed(1)}</td>
                    </tr>
                  ))}
                  {(snapshot.top_queries ?? []).length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-4 text-muted-foreground">
                        No query data yet — Search Console needs a few days of traffic.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">Scan history</h2>
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-sm">
                <thead className="bg-secondary/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="p-3">When</th>
                    <th className="p-3">Clicks</th>
                    <th className="p-3">Impr.</th>
                    <th className="p-3">Avg pos.</th>
                    <th className="p-3">Changes</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h, i) => {
                    const prev = history[i + 1];
                    const delta =
                      prev && h.avg_position !== null && prev.avg_position !== null
                        ? Number(h.avg_position) - Number(prev.avg_position)
                        : null;
                    return (
                      <tr key={h.id ?? h.captured_at} className="border-t border-border">
                        <td className="p-3">{fmtDate(h.captured_at)}</td>
                        <td className="p-3">{h.clicks}</td>
                        <td className="p-3">{h.impressions}</td>
                        <td className="p-3">
                          <span className="inline-flex items-center gap-1">
                            {h.avg_position === null ? "—" : Number(h.avg_position).toFixed(1)}
                            {delta !== null && Math.abs(delta) >= 0.5 && (
                              delta < 0
                                ? <ArrowUpRight className="h-3.5 w-3.5 text-primary" aria-label="improved" />
                                : <ArrowDownRight className="h-3.5 w-3.5 text-destructive" aria-label="dropped" />
                            )}
                          </span>
                        </td>
                        <td className="p-3">{(h.changes ?? []).length}</td>
                      </tr>
                    );
                  })}
                  {history.length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-4 text-muted-foreground">No scans recorded yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
