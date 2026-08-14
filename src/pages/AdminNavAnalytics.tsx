import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Compass, Download, Layers, Loader2, MousePointerClick, Route as RouteIcon } from "lucide-react";
import { format, subDays } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { StatCard } from "@/components/StatCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { downloadCsv } from "@/lib/exportFile";
import { toast } from "sonner";
import { PageHeader } from "@/components/app/PageHeader";

/**
 * Navigation analytics for the sidebar, submenus, breadcrumbs and mobile nav.
 *
 * Reads the same `analytics_events` rows that `navAnalytics.ts` writes, and
 * answers three questions: which groups get opened, which subtabs actually get
 * clicked after an open (click-through rate), and which group -> item paths are
 * most travelled.
 */

type NavRow = {
  event_name: string;
  location: string | null;
  destination: string | null;
  path: string | null;
  session_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

const PRESETS = [7, 30, 90] as const;
const EXPORT_COLUMNS = [
  "created_at",
  "event_name",
  "surface",
  "group",
  "group_title",
  "item",
  "item_title",
  "state",
  "destination",
  "path",
  "session_id",
] as const;

const metaString = (row: NavRow, key: string) => {
  const value = row.metadata?.[key];
  return typeof value === "string" ? value : "";
};

export default function AdminNavAnalytics() {
  const [days, setDays] = useState<number>(30);
  const [from, setFrom] = useState(() => format(subDays(new Date(), 30), "yyyy-MM-dd"));
  const [to, setTo] = useState(() => format(new Date(), "yyyy-MM-dd"));

  const applyPreset = (preset: number) => {
    setDays(preset);
    setFrom(format(subDays(new Date(), preset), "yyyy-MM-dd"));
    setTo(format(new Date(), "yyyy-MM-dd"));
  };

  const { data, isLoading, error } = useQuery({
    queryKey: ["navAnalytics", from, to],
    queryFn: async (): Promise<NavRow[]> => {
      const { data, error } = await supabase
        .from("analytics_events")
        .select("event_name,location,destination,path,session_id,metadata,created_at")
        .in("event_name", ["nav_group_toggle", "nav_item_click"])
        .gte("created_at", `${from}T00:00:00.000Z`)
        .lte("created_at", `${to}T23:59:59.999Z`)
        .order("created_at", { ascending: false })
        .limit(20000);
      if (error) throw error;
      return (data || []) as NavRow[];
    },
  });

  const summary = useMemo(() => {
    const rows = data ?? [];
    const opens = rows.filter((r) => r.event_name === "nav_group_toggle" && metaString(r, "state") === "open");
    const clicks = rows.filter((r) => r.event_name === "nav_item_click");

    const byGroup = new Map<string, { title: string; opens: number; clicks: number }>();
    for (const row of opens) {
      const id = metaString(row, "group") || "unknown";
      const entry = byGroup.get(id) ?? { title: metaString(row, "group_title") || id, opens: 0, clicks: 0 };
      entry.opens += 1;
      byGroup.set(id, entry);
    }
    for (const row of clicks) {
      const id = metaString(row, "group") || "root";
      const entry = byGroup.get(id) ?? { title: metaString(row, "group_title") || id, opens: 0, clicks: 0 };
      entry.clicks += 1;
      byGroup.set(id, entry);
    }

    const groups = [...byGroup.entries()]
      .map(([id, g]) => ({
        id,
        ...g,
        ctr: g.opens > 0 ? Math.round((g.clicks / g.opens) * 100) : null,
      }))
      .sort((a, b) => b.opens + b.clicks - (a.opens + a.clicks));

    const pathCounts = new Map<string, number>();
    for (const row of clicks) {
      const label = `${metaString(row, "group_title") || "Root"} → ${metaString(row, "item_title") || metaString(row, "item")}`;
      pathCounts.set(label, (pathCounts.get(label) ?? 0) + 1);
    }
    const topPaths = [...pathCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);

    const surfaceCounts = new Map<string, number>();
    for (const row of rows) {
      const surface = row.location || metaString(row, "location") || "unknown";
      surfaceCounts.set(surface, (surfaceCounts.get(surface) ?? 0) + 1);
    }

    return {
      totalOpens: opens.length,
      totalClicks: clicks.length,
      ctr: opens.length > 0 ? Math.round((clicks.length / opens.length) * 100) : 0,
      sessions: new Set(rows.map((r) => r.session_id).filter(Boolean)).size,
      groups,
      topPaths,
      surfaces: [...surfaceCounts.entries()].sort((a, b) => b[1] - a[1]),
    };
  }, [data]);

  const exportCsv = () => {
    const rows = data ?? [];
    if (rows.length === 0) {
      toast.error("Nothing to export for this date range");
      return;
    }
    downloadCsv(
      `gradr-nav-analytics-${from}_to_${to}.csv`,
      rows.map((row) => ({
        created_at: row.created_at,
        event_name: row.event_name,
        surface: row.location ?? metaString(row, "location"),
        group: metaString(row, "group"),
        group_title: metaString(row, "group_title"),
        item: metaString(row, "item"),
        item_title: metaString(row, "item_title"),
        state: metaString(row, "state"),
        destination: row.destination ?? "",
        path: row.path ?? "",
        session_id: row.session_id ?? "",
      })),
      [...EXPORT_COLUMNS],
    );
    toast.success(`Exported ${rows.length} navigation events`);
  };

  return (
    <div className="page-shell page-stack">
      <PageHeader
        eyebrow="Operations"
        icon={<Compass className="h-3.5 w-3.5" aria-hidden="true" />}
        title="Navigation analytics"
        description="Sidebar group opens, subtab click-through and the most-travelled navigation paths."
        actions={
          <Button onClick={exportCsv} variant="outline" size="sm">
            <Download className="mr-2 h-4 w-4" aria-hidden="true" />
            Export CSV
          </Button>
        }
      />

      <Card>
        <CardContent className="flex flex-wrap items-end gap-4 pt-6">
          <div className="flex gap-2">
            {PRESETS.map((preset) => (
              <Button
                key={preset}
                size="sm"
                variant={days === preset ? "default" : "outline"}
                onClick={() => applyPreset(preset)}
              >
                Last {preset}d
              </Button>
            ))}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="nav-from">From</Label>
            <Input
              id="nav-from"
              type="date"
              value={from}
              max={to}
              onChange={(e) => {
                setFrom(e.target.value);
                setDays(0);
              }}
              className="w-[10rem]"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="nav-to">To</Label>
            <Input
              id="nav-to"
              type="date"
              value={to}
              min={from}
              onChange={(e) => {
                setTo(e.target.value);
                setDays(0);
              }}
              className="w-[10rem]"
            />
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex justify-center py-16" role="status" aria-label="Loading navigation analytics">
          <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden="true" />
        </div>
      ) : error ? (
        <p className="text-sm text-destructive">Could not load navigation analytics.</p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard title="Group opens" value={summary.totalOpens.toLocaleString()} icon={Layers} />
            <StatCard title="Nav clicks" value={summary.totalClicks.toLocaleString()} icon={MousePointerClick} />
            <StatCard title="Click-through" value={`${summary.ctr}%`} icon={Compass} />
            <StatCard title="Sessions" value={summary.sessions.toLocaleString()} icon={RouteIcon} />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Groups</CardTitle>
                <CardDescription>Opens, clicks and click-through per sidebar group.</CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full text-sm">
                  <caption className="sr-only">Navigation group engagement</caption>
                  <thead>
                    <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th scope="col" className="py-2 pr-4 font-medium">Group</th>
                      <th scope="col" className="py-2 pr-4 text-right font-medium">Opens</th>
                      <th scope="col" className="py-2 pr-4 text-right font-medium">Clicks</th>
                      <th scope="col" className="py-2 text-right font-medium">CTR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.groups.length === 0 && (
                      <tr>
                        <td colSpan={4} className="py-6 text-center text-muted-foreground">
                          No navigation events in this range.
                        </td>
                      </tr>
                    )}
                    {summary.groups.map((group) => (
                      <tr key={group.id} className="border-b last:border-0">
                        <td className="py-2 pr-4 font-medium text-foreground">{group.title}</td>
                        <td className="py-2 pr-4 text-right tabular-nums">{group.opens}</td>
                        <td className="py-2 pr-4 text-right tabular-nums">{group.clicks}</td>
                        <td className="py-2 text-right tabular-nums">{group.ctr === null ? "—" : `${group.ctr}%`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Top navigation paths</CardTitle>
                <CardDescription>Most-used group → subtab journeys.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {summary.topPaths.length === 0 && (
                  <p className="text-sm text-muted-foreground">No clicks recorded in this range.</p>
                )}
                {summary.topPaths.map(([label, count]) => {
                  const max = summary.topPaths[0][1] || 1;
                  return (
                    <div key={label} className="space-y-1">
                      <div className="flex items-center justify-between gap-4 text-sm">
                        <span className="truncate text-foreground">{label}</span>
                        <span className="tabular-nums text-muted-foreground">{count}</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${(count / max) * 100}%` }} />
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Surfaces</CardTitle>
              <CardDescription>Where navigation happens: sidebar, rail, mobile drawer, tab bar, breadcrumb.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {summary.surfaces.length === 0 && <p className="text-sm text-muted-foreground">No data.</p>}
              {summary.surfaces.map(([surface, count]) => (
                <span key={surface} className="rounded-full border border-border/60 px-3 py-1 text-sm">
                  {surface.replace(/_/g, " ")} · <span className="tabular-nums text-muted-foreground">{count}</span>
                </span>
              ))}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
