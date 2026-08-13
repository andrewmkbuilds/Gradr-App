import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { invokeFunction } from "@/lib/invokeFunction";
import { Navigate } from "@/lib/router-compat";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CheckCircle2, Download, Loader2, RefreshCw, TrendingUp, XCircle } from "lucide-react";
import { useIsAdmin } from "@/hooks/useAffiliate";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Seo } from "@/components/Seo";

interface SeriesPoint {
  date: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number | null;
}

interface Snapshot {
  status: string;
  property?: string;
  totals?: { clicks: number; impressions: number; ctr: number; avgPosition: number | null };
  timeseries?: SeriesPoint[];
  seriesRange?: { start: string; end: string };
  coverage?: { indexed: number; notIndexed: number; issues: number; unknown: number };
  topQueries?: { query: string; clicks: number; impressions: number; ctr: number; position: number }[];
  topPages?: { page: string; clicks: number; impressions: number; ctr: number; position: number }[];
  inspections?: { url: string; verdict?: string; coverageState?: string | null; lastCrawlTime?: string | null; error?: string }[];
  refreshedAt?: string;
  error?: string;
}

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
const num = (v: number) => v.toLocaleString();
const shortDate = (d: string) => d.slice(5);

function downloadCsv(rows: SeriesPoint[]) {
  const header = "date,clicks,impressions,ctr,avg_position";
  const body = rows
    .map((r) => [r.date, r.clicks, r.impressions, r.ctr.toFixed(4), r.position ?? ""].join(","))
    .join("\n");
  const blob = new Blob([`${header}\n${body}\n`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `gradr-search-performance-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function AdminSeoPerformance() {
  const { data: isAdmin, isLoading: loadingAdmin } = useIsAdmin();

  const { data, isFetching, refetch, isLoading } = useQuery({
    queryKey: ["seo-performance-snapshot"],
    enabled: !!isAdmin,
    staleTime: 15 * 60 * 1000,
    queryFn: async (): Promise<Snapshot> => {
      const { data, error } = await invokeFunction("search-console", { body: {} });
      if (error) throw new Error(error.message);
      return data as Snapshot;
    },
  });

  const series = useMemo(() => data?.timeseries ?? [], [data]);
  const trend = useMemo(() => {
    if (series.length < 14) return null;
    const half = Math.floor(series.length / 2);
    const sum = (rows: SeriesPoint[], key: "clicks" | "impressions") =>
      rows.reduce((acc, r) => acc + (r[key] ?? 0), 0);
    const prevClicks = sum(series.slice(0, half), "clicks");
    const currClicks = sum(series.slice(half), "clicks");
    const prevImpr = sum(series.slice(0, half), "impressions");
    const currImpr = sum(series.slice(half), "impressions");
    return { prevClicks, currClicks, prevImpr, currImpr };
  }, [series]);

  if (loadingAdmin) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!isAdmin) return <Navigate to="/" replace />;

  const totals = data?.totals;
  const coverage = data?.coverage;

  return (
    <div className="max-w-6xl space-y-6">
      <Seo
        title="SEO performance"
        description="Search Console clicks, impressions, CTR and indexing coverage over time."
        path="/admin/seo-performance"
      />

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <TrendingUp className="h-5 w-5 text-primary" />
            SEO performance
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Clicks, impressions, CTR and indexing coverage from Google Search Console.
            {data?.seriesRange ? ` ${data.seriesRange.start} → ${data.seriesRange.end}.` : ""}
            {data?.property ? ` Property: ${data.property}` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={!series.length}
            onClick={() => downloadCsv(series)}
          >
            <Download className="mr-2 h-4 w-4" />
            CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : data?.status !== "ok" ? (
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground">
            {data?.error ??
              "Search Console data is not available yet. Confirm the property is connected and verified."}
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "Clicks (28d)", value: num(totals?.clicks ?? 0) },
              { label: "Impressions (28d)", value: num(totals?.impressions ?? 0) },
              { label: "CTR (28d)", value: pct(totals?.ctr ?? 0) },
              {
                label: "Avg. position",
                value: totals?.avgPosition ? totals.avgPosition.toFixed(1) : "—",
              },
            ].map((kpi) => (
              <Card key={kpi.label}>
                <CardContent className="py-5">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    {kpi.label}
                  </p>
                  <p className="mt-2 text-2xl font-semibold">{kpi.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {trend && (
            <p className="text-sm text-muted-foreground">
              Last {Math.ceil(series.length / 2)} days vs the previous period:{" "}
              <span className="font-medium text-foreground">
                {num(trend.currClicks)} clicks
              </span>{" "}
              (was {num(trend.prevClicks)}) ·{" "}
              <span className="font-medium text-foreground">
                {num(trend.currImpr)} impressions
              </span>{" "}
              (was {num(trend.prevImpr)}).
            </p>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Clicks &amp; impressions</CardTitle>
            </CardHeader>
            <CardContent className="h-72">
              {series.length === 0 ? (
                <p className="py-16 text-center text-sm text-muted-foreground">
                  Google has not reported any performance rows for this range yet. That is normal
                  for a recently indexed site and is not proof of zero traffic.
                </p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={series} margin={{ left: -20, right: 8, top: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" tickFormatter={shortDate} fontSize={11} />
                    <YAxis fontSize={11} />
                    <Tooltip />
                    <Area
                      type="monotone"
                      dataKey="impressions"
                      stroke="hsl(var(--primary))"
                      fill="hsl(var(--primary) / 0.15)"
                    />
                    <Area
                      type="monotone"
                      dataKey="clicks"
                      stroke="hsl(var(--accent))"
                      fill="hsl(var(--accent) / 0.25)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">CTR &amp; average position</CardTitle>
              </CardHeader>
              <CardContent className="h-64">
                {series.length === 0 ? (
                  <p className="py-12 text-center text-sm text-muted-foreground">No data yet.</p>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={series} margin={{ left: -20, right: 8, top: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="date" tickFormatter={shortDate} fontSize={11} />
                      <YAxis fontSize={11} />
                      <Tooltip />
                      <Line
                        type="monotone"
                        dataKey="ctr"
                        stroke="hsl(var(--accent))"
                        dot={false}
                        name="CTR"
                      />
                      <Line
                        type="monotone"
                        dataKey="position"
                        stroke="hsl(var(--primary))"
                        dot={false}
                        name="Avg. position"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Indexing coverage</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-4 gap-2 text-center">
                  {[
                    { label: "Indexed", value: coverage?.indexed ?? 0 },
                    { label: "Issues", value: coverage?.issues ?? 0 },
                    { label: "Not indexed", value: coverage?.notIndexed ?? 0 },
                    { label: "Unknown", value: coverage?.unknown ?? 0 },
                  ].map((c) => (
                    <div key={c.label} className="rounded-lg border border-border/70 py-3">
                      <p className="text-xl font-semibold">{c.value}</p>
                      <p className="text-[11px] text-muted-foreground">{c.label}</p>
                    </div>
                  ))}
                </div>
                <ul className="space-y-2 text-sm">
                  {(data.inspections ?? []).map((i) => (
                    <li key={i.url} className="flex items-start gap-2">
                      {i.verdict === "PASS" ? (
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      ) : (
                        <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                      <span className="min-w-0">
                        <span className="block truncate text-foreground">
                          {i.url.replace(/^https?:\/\/[^/]+/, "") || "/"}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {i.error ?? i.coverageState ?? i.verdict ?? "unknown"}
                          {i.lastCrawlTime
                            ? ` · crawled ${new Date(i.lastCrawlTime).toLocaleDateString()}`
                            : ""}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {[
              { title: "Top queries", rows: data.topQueries ?? [], key: "query" as const },
              { title: "Top pages", rows: data.topPages ?? [], key: "page" as const },
            ].map((table) => (
              <Card key={table.title}>
                <CardHeader>
                  <CardTitle className="text-base">{table.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  {table.rows.length === 0 ? (
                    <p className="py-6 text-sm text-muted-foreground">No rows reported yet.</p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead className="text-xs uppercase text-muted-foreground">
                        <tr>
                          <th className="py-1 text-left font-medium">{table.key}</th>
                          <th className="py-1 text-right font-medium">Clicks</th>
                          <th className="py-1 text-right font-medium">Impr.</th>
                          <th className="py-1 text-right font-medium">CTR</th>
                          <th className="py-1 text-right font-medium">Pos.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {table.rows.map((row) => (
                          <tr
                            key={(row as Record<string, unknown>)[table.key] as string}
                            className="border-t border-border/60"
                          >
                            <td className="max-w-[220px] truncate py-1.5">
                              {(row as Record<string, unknown>)[table.key] as string}
                            </td>
                            <td className="py-1.5 text-right">{num(row.clicks)}</td>
                            <td className="py-1.5 text-right">{num(row.impressions)}</td>
                            <td className="py-1.5 text-right">{pct(row.ctr)}</td>
                            <td className="py-1.5 text-right">{row.position.toFixed(1)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          {data.refreshedAt && (
            <p className="text-xs text-muted-foreground">
              Refreshed {new Date(data.refreshedAt).toLocaleString()}. Search Console data lags by
              two to three days.
            </p>
          )}
        </>
      )}
    </div>
  );
}
