import { useQuery } from "@tanstack/react-query";
import { Navigate } from "react-router-dom";
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  Loader2,
  RefreshCw,
  Search,
  XCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useIsAdmin } from "@/hooks/useAffiliate";
import { Button } from "@/components/ds/Button";
import { Seo } from "@/components/Seo";
import { PageHeader } from "@/components/app/PageHeader";
import { AdminErrorState } from "@/components/admin/AdminErrorState";

interface Alert {
  level: "error" | "warning" | "info";
  title: string;
  detail: string;
}

interface Inspection {
  url: string;
  verdict?: string;
  coverageState?: string | null;
  robotsTxtState?: string | null;
  pageFetchState?: string | null;
  lastCrawlTime?: string | null;
  googleCanonical?: string | null;
  error?: string;
}

interface SitemapRow {
  path: string;
  lastSubmitted: string | null;
  lastDownloaded: string | null;
  isPending: boolean;
  warnings: number;
  errors: number;
}

interface SearchConsoleSnapshot {
  status: string;
  property?: string;
  candidates?: string[];
  range?: { start: string; end: string };
  totals?: { clicks: number; impressions: number; ctr: number; avgPosition: number | null };
  topQueries?: { query: string; clicks: number; impressions: number; ctr: number; position: number }[];
  topPages?: { page: string; clicks: number; impressions: number; ctr: number; position: number }[];
  sitemaps?: SitemapRow[];
  inspections?: Inspection[];
  alerts?: Alert[];
  refreshedAt?: string;
  error?: string;
}

const LEVEL_STYLE: Record<Alert["level"], { icon: typeof Info; cls: string }> = {
  error: { icon: XCircle, cls: "border-destructive/40 bg-destructive/10 text-destructive" },
  warning: { icon: AlertTriangle, cls: "border-warning/40 bg-warning/10 text-warning" },
  info: { icon: Info, cls: "border-border bg-secondary text-muted-foreground" },
};

function verdictBadge(v?: string) {
  if (v === "PASS") return "bg-primary/10 text-primary";
  if (v === "FAIL") return "bg-destructive/10 text-destructive";
  return "bg-warning/10 text-warning";
}

function fmtDate(v?: string | null) {
  if (!v) return "—";
  return new Date(v).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function AdminSearchConsole() {
  const { data: isAdmin, isLoading: loadingAdmin } = useIsAdmin();

  const { data, isLoading, isFetching, refetch, error } = useQuery({
    queryKey: ["search-console-snapshot"],
    enabled: !!isAdmin,
    staleTime: 15 * 60 * 1000,
    queryFn: async (): Promise<SearchConsoleSnapshot> => {
      const { data, error } = await supabase.functions.invoke("search-console", { body: {} });
      if (error) throw new Error(error.message);
      return data as SearchConsoleSnapshot;
    },
  });

  if (loadingAdmin) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!isAdmin) return <Navigate to="/" replace />;

  const alerts = data?.alerts ?? [];
  const healthy = data?.status === "ok" && alerts.filter((a) => a.level !== "info").length === 0;

  return (
    <div className="page-shell page-stack">
      <Seo title="Search Console health" description="Crawl errors and indexing issues from Google Search Console." path="/admin/search-console" />

      <PageHeader
        eyebrow="Operations"
        icon={<Search className="h-3.5 w-3.5" aria-hidden="true" />}
        title="Search Console health"
        description={`Crawl errors, indexing state and search performance pulled live from Google Search Console.${data?.property ? ` Property: ${data.property}` : ""}`}
        actions={
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        }
      />

      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-12">
          <Loader2 className="h-4 w-4 animate-spin" /> Fetching Search Console data…
        </div>
      )}

      {error && (
        <AdminErrorState error={error} resource="Search Console data" onRetry={() => refetch()} isRetrying={isFetching} />
      )}

      {data?.status === "no_property" && (
        <div className="rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm text-warning">
          No verified Search Console property covers this site yet.
        </div>
      )}

      {data?.status === "ok" && (
        <>
          {/* Alerts */}
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-foreground">Alerts</h2>
            {healthy && (
              <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 p-4 text-sm text-primary">
                <CheckCircle2 className="h-4 w-4" />
                No crawl errors or indexing issues reported.
              </div>
            )}
            {alerts.map((a, i) => {
              const { icon: Icon, cls } = LEVEL_STYLE[a.level];
              return (
                <div key={i} className={`flex items-start gap-3 rounded-lg border p-3 text-sm ${cls}`}>
                  <Icon className="h-4 w-4 mt-0.5 shrink-0" />
                  <div>
                    <div className="font-medium">{a.title}</div>
                    <div className="opacity-80">{a.detail}</div>
                  </div>
                </div>
              );
            })}
          </section>

          {/* Performance */}
          <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Clicks", value: data.totals?.clicks ?? 0 },
              { label: "Impressions", value: data.totals?.impressions ?? 0 },
              {
                label: "CTR",
                value: `${(((data.totals?.ctr ?? 0) as number) * 100).toFixed(1)}%`,
              },
              {
                label: "Avg. position",
                value: data.totals?.avgPosition ? data.totals.avgPosition.toFixed(1) : "—",
              },
            ].map((s) => (
              <div key={s.label} className="rounded-lg border border-border bg-card p-4">
                <div className="text-xs text-muted-foreground">{s.label}</div>
                <div className="type-h1 text-foreground mt-1">{s.value}</div>
              </div>
            ))}
            <p className="col-span-full text-xs text-muted-foreground">
              {data.range ? `${data.range.start} → ${data.range.end}` : ""} · Search Console lags ~3 days and omits
              low-volume queries.
            </p>
          </section>

          {/* Sitemaps */}
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-foreground">Sitemaps</h2>
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-secondary/50 text-muted-foreground">
                  <tr>
                    <th className="text-left p-3 font-medium">Sitemap</th>
                    <th className="text-left p-3 font-medium">Submitted</th>
                    <th className="text-left p-3 font-medium">Last read</th>
                    <th className="text-left p-3 font-medium">Errors</th>
                    <th className="text-left p-3 font-medium">Warnings</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.sitemaps ?? []).length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-4 text-muted-foreground">No sitemaps submitted.</td>
                    </tr>
                  )}
                  {(data.sitemaps ?? []).map((s) => (
                    <tr key={s.path} className="border-t border-border">
                      <td className="p-3 text-foreground break-all">{s.path}</td>
                      <td className="p-3 text-muted-foreground">{fmtDate(s.lastSubmitted)}</td>
                      <td className="p-3 text-muted-foreground">{fmtDate(s.lastDownloaded)}</td>
                      <td className={`p-3 ${s.errors ? "text-destructive" : "text-muted-foreground"}`}>{s.errors}</td>
                      <td className={`p-3 ${s.warnings ? "text-warning" : "text-muted-foreground"}`}>{s.warnings}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Indexing */}
          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-foreground">Key page indexing</h2>
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-secondary/50 text-muted-foreground">
                  <tr>
                    <th className="text-left p-3 font-medium">URL</th>
                    <th className="text-left p-3 font-medium">Verdict</th>
                    <th className="text-left p-3 font-medium">Coverage</th>
                    <th className="text-left p-3 font-medium">Last crawl</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.inspections ?? []).map((i) => (
                    <tr key={i.url} className="border-t border-border">
                      <td className="p-3 text-foreground break-all">{i.url}</td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded text-xs ${verdictBadge(i.verdict)}`}>
                          {i.error ? "ERROR" : i.verdict ?? "—"}
                        </span>
                      </td>
                      <td className="p-3 text-muted-foreground">{i.error ?? i.coverageState ?? "—"}</td>
                      <td className="p-3 text-muted-foreground">{fmtDate(i.lastCrawlTime)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Queries */}
          {(data.topQueries ?? []).length > 0 && (
            <section className="space-y-2">
              <h2 className="text-sm font-semibold text-foreground">Top queries</h2>
              <div className="rounded-lg border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-secondary/50 text-muted-foreground">
                    <tr>
                      <th className="text-left p-3 font-medium">Query</th>
                      <th className="text-left p-3 font-medium">Clicks</th>
                      <th className="text-left p-3 font-medium">Impressions</th>
                      <th className="text-left p-3 font-medium">Position</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data.topQueries ?? []).map((q) => (
                      <tr key={q.query} className="border-t border-border">
                        <td className="p-3 text-foreground">{q.query}</td>
                        <td className="p-3 text-muted-foreground">{q.clicks}</td>
                        <td className="p-3 text-muted-foreground">{q.impressions}</td>
                        <td className="p-3 text-muted-foreground">{q.position?.toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
