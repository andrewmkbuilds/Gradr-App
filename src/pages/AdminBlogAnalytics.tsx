import { useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Loader2, MousePointerClick, Eye, TrendingUp, Link2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useIsAdmin } from "@/hooks/useAffiliate";
import { StatCard } from "@/components/StatCard";
import { PageHeader } from "@/components/app/PageHeader";
import { Button } from "@/components/ds/Button";
import { cn } from "@/lib/utils";

const ARTICLE = "ai-resume-optimization";
const RANGES = [
  { label: "24h", hours: 24 },
  { label: "7d", hours: 24 * 7 },
  { label: "30d", hours: 24 * 30 },
  { label: "All time", hours: 0 },
] as const;

type Row = {
  event_name: string;
  location: string | null;
  destination: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  session_id: string | null;
  created_at: string;
};

export default function AdminBlogAnalytics() {
  const { data: isAdmin, isLoading: loadingAdmin } = useIsAdmin();
  const [rangeIdx, setRangeIdx] = useState(1);
  const range = RANGES[rangeIdx];

  const { data, isLoading } = useQuery({
    queryKey: ["blogAnalytics", ARTICLE, range.hours],
    queryFn: async (): Promise<Row[]> => {
      let q = supabase
        .from("analytics_events")
        .select("event_name,location,destination,utm_source,utm_medium,utm_campaign,utm_content,session_id,created_at")
        .eq("article", ARTICLE)
        .order("created_at", { ascending: false })
        .limit(5000);
      if (range.hours > 0) {
        const since = new Date(Date.now() - range.hours * 3600_000).toISOString();
        q = q.gte("created_at", since);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as Row[];
    },
    enabled: !!isAdmin,
  });

  const summary = useMemo(() => {
    const rows = data || [];
    const views = rows.filter((r) => r.event_name === "blog_page_view");
    const clicks = rows.filter((r) => r.event_name === "blog_cta_click");
    const uniqueViewSessions = new Set(views.map((r) => r.session_id).filter(Boolean));
    const uniqueClickSessions = new Set(clicks.map((r) => r.session_id).filter(Boolean));

    const byLocation = new Map<string, number>();
    const byDestination = new Map<string, number>();
    const byReferrer = new Map<string, number>();
    for (const c of clicks) {
      const loc = c.location || "(unknown)";
      byLocation.set(loc, (byLocation.get(loc) || 0) + 1);
      const dest = c.destination || "(unknown)";
      byDestination.set(dest, (byDestination.get(dest) || 0) + 1);
      const src = [c.utm_source, c.utm_medium].filter(Boolean).join(" · ") || "(direct)";
      byReferrer.set(src, (byReferrer.get(src) || 0) + 1);
    }

    const ctr = views.length ? (clicks.length / views.length) * 100 : 0;
    const uniqueCtr = uniqueViewSessions.size
      ? (uniqueClickSessions.size / uniqueViewSessions.size) * 100
      : 0;

    return {
      views: views.length,
      uniqueViews: uniqueViewSessions.size,
      clicks: clicks.length,
      uniqueClicks: uniqueClickSessions.size,
      ctr,
      uniqueCtr,
      byLocation: [...byLocation.entries()].sort((a, b) => b[1] - a[1]),
      byDestination: [...byDestination.entries()].sort((a, b) => b[1] - a[1]),
      byReferrer: [...byReferrer.entries()].sort((a, b) => b[1] - a[1]),
    };
  }, [data]);

  if (loadingAdmin)
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  if (!isAdmin) return <Navigate to="/" replace />;

  return (
    <div className="page-shell page-stack">
      <PageHeader
        eyebrow="Operations"
        icon={<TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />}
        title="Blog analytics"
        description={<>CTA performance for <code className="text-xs">/blog/ai-resume-optimization</code></>}
        actions={
          <div className="flex gap-1 rounded-lg border border-border p-1">
            {RANGES.map((r, i) => (
              <Button
                key={r.label}
                size="sm"
                variant={i === rangeIdx ? "default" : "ghost"}
                className="h-7 px-3 text-xs"
                onClick={() => setRangeIdx(i)}
              >
                {r.label}
              </Button>
            ))}
          </div>
        }
      />

      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <StatCard
              title="Page views"
              value={summary.views.toLocaleString()}
              icon={Eye}
              subtitle={`${summary.uniqueViews.toLocaleString()} unique sessions`}
            />
            <StatCard
              title="CTA clicks"
              value={summary.clicks.toLocaleString()}
              icon={MousePointerClick}
              subtitle={`${summary.uniqueClicks.toLocaleString()} unique sessions`}
            />
            <StatCard
              title="CTA CTR"
              value={`${summary.ctr.toFixed(1)}%`}
              icon={TrendingUp}
              subtitle="Clicks ÷ views"
            />
            <StatCard
              title="Unique CTR"
              value={`${summary.uniqueCtr.toFixed(1)}%`}
              icon={TrendingUp}
              subtitle="Unique clickers ÷ unique viewers"
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Breakdown title="Clicks by placement" icon={Link2} rows={summary.byLocation} total={summary.clicks} />
            <Breakdown title="Clicks by destination" icon={Link2} rows={summary.byDestination} total={summary.clicks} />
            <Breakdown title="Clicks by traffic source (UTM)" icon={Link2} rows={summary.byReferrer} total={summary.clicks} />
          </div>
        </>
      )}
    </div>
  );
}

function Breakdown({
  title,
  icon: Icon,
  rows,
  total,
}: {
  title: string;
  icon: typeof Link2;
  rows: [string, number][];
  total: number;
}) {
  return (
    <div className="elev-2 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">No events in this range yet.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map(([key, count]) => {
            const pct = total ? (count / total) * 100 : 0;
            return (
              <li key={key}>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-foreground truncate mr-3">{key}</span>
                  <span className="text-muted-foreground text-xs shrink-0">
                    {count.toLocaleString()} · {pct.toFixed(1)}%
                  </span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-secondary overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${Math.min(pct, 100)}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
