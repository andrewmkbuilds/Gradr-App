/**
 * Public API status page — /status
 *
 * Shows current alert counts, last successful webhook delivery, per-component
 * health for the last 24h, and a 30-day incident history. All data is
 * aggregate; nothing user-identifying is exposed.
 */
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, CheckCircle2, Clock, Gauge, RefreshCw, Siren } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getStatusSnapshot } from "@/lib/status.functions";
import { cn } from "@/lib/utils";

const TONE: Record<string, { label: string; badge: string; dot: string }> = {
  operational: {
    label: "All systems operational",
    badge: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    dot: "bg-emerald-500",
  },
  degraded: {
    label: "Degraded performance",
    badge: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
    dot: "bg-amber-500",
  },
  outage: {
    label: "Active incident",
    badge: "border-destructive/30 bg-destructive/10 text-destructive",
    dot: "bg-destructive",
  },
};

function when(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)} h ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function Metric({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Gauge;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card className="glass-card p-5">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Icon className="h-4 w-4 text-accent" aria-hidden="true" />
        {label}
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </Card>
  );
}

export default function StatusPage() {
  const fetchStatus = useServerFn(getStatusSnapshot);
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["public-status"],
    queryFn: () => fetchStatus(),
    refetchInterval: 60_000,
  });

  const tone = TONE[data?.overall ?? "operational"] ?? TONE['operational']!;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Gradr system status
          </h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            Live health of the Gradr platform — API success rates, webhook delivery, and any open
            incidents. Updated every minute.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching}>
          <RefreshCw className={cn("mr-2 h-4 w-4", isFetching && "animate-spin")} aria-hidden="true" />
          Refresh
        </Button>
      </header>

      {isLoading ? (
        <div className="mt-8 space-y-4">
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>
      ) : !data ? (
        <Card className="glass-card mt-8 p-6 text-sm text-muted-foreground">
          Status data is temporarily unavailable. Please check back shortly.
        </Card>
      ) : (
        <>
          <Card className="glass-card mt-8 flex flex-wrap items-center justify-between gap-4 p-6">
            <div className="flex items-center gap-3">
              <span className={cn("h-3 w-3 rounded-full", tone.dot)} aria-hidden="true" />
              <div>
                <p className="text-lg font-semibold text-foreground">{tone.label}</p>
                <p className="text-xs text-muted-foreground">
                  Snapshot taken {when(data.generatedAt)}
                </p>
              </div>
            </div>
            <Badge variant="outline" className={tone.badge}>
              {data.openAlerts} open alert{data.openAlerts === 1 ? "" : "s"}
            </Badge>
          </Card>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Metric
              icon={Siren}
              label="Open alerts"
              value={String(data.openAlerts)}
              hint={`${data.criticalAlerts} critical · ${data.resolvedLast7d} resolved in 7d`}
            />
            <Metric
              icon={CheckCircle2}
              label="Last successful delivery"
              value={when(data.lastSuccessfulDelivery?.at ?? null)}
              hint={
                data.lastSuccessfulDelivery
                  ? `${data.lastSuccessfulDelivery.provider}${
                      data.lastSuccessfulDelivery.eventType
                        ? ` · ${data.lastSuccessfulDelivery.eventType}`
                        : ""
                    }`
                  : "No deliveries recorded yet"
              }
            />
            <Metric
              icon={Gauge}
              label="Success rate (24h)"
              value={data.successRate24h === null ? "—" : `${data.successRate24h}%`}
              hint={`${data.requests24h.toLocaleString()} checks`}
            />
            <Metric
              icon={Clock}
              label="p95 response"
              value={data.p95DurationMs === null ? "—" : `${data.p95DurationMs} ms`}
              hint="Across monitored endpoints"
            />
          </div>

          <section className="mt-10" aria-labelledby="components-heading">
            <h2 id="components-heading" className="text-lg font-semibold text-foreground">
              Components
            </h2>
            <Card className="glass-card mt-3 divide-y divide-border/60">
              {data.components.length === 0 ? (
                <p className="p-5 text-sm text-muted-foreground">
                  No traffic recorded in the last 24 hours.
                </p>
              ) : (
                data.components.map((c) => {
                  const t = TONE[c.status] ?? TONE['operational']!;
                  return (
                    <div key={c.name} className="flex items-center justify-between gap-4 p-4">
                      <div className="flex items-center gap-3">
                        <span className={cn("h-2.5 w-2.5 rounded-full", t.dot)} aria-hidden="true" />
                        <span className="text-sm font-medium text-foreground">{c.name}</span>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-foreground">
                          {c.successRate === null ? "—" : `${c.successRate}%`}
                        </p>
                        <p className="text-xs text-muted-foreground">{c.checks} checks / 24h</p>
                      </div>
                    </div>
                  );
                })
              )}
            </Card>
          </section>

          <section className="mt-10" aria-labelledby="incidents-heading">
            <h2 id="incidents-heading" className="text-lg font-semibold text-foreground">
              Incident history
              <span className="ml-2 text-sm font-normal text-muted-foreground">last 30 days</span>
            </h2>
            <Card className="glass-card mt-3 divide-y divide-border/60">
              {data.incidents.length === 0 ? (
                <p className="p-5 text-sm text-muted-foreground">
                  No incidents in the last 30 days.
                </p>
              ) : (
                data.incidents.map((i) => (
                  <article key={i.id} className="space-y-1 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      {i.resolved ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" aria-hidden="true" />
                      ) : (
                        <AlertTriangle className="h-4 w-4 text-amber-500" aria-hidden="true" />
                      )}
                      <span className="text-sm font-medium text-foreground">{i.summary}</span>
                      <Badge variant="outline" className="text-xs">
                        {i.endpoint}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-xs",
                          i.resolved
                            ? "border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
                            : "border-amber-500/30 text-amber-600 dark:text-amber-400",
                        )}
                      >
                        {i.resolved ? "Resolved" : "Monitoring"}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Started {when(i.startedAt)}
                      {i.endedAt ? ` · resolved ${when(i.endedAt)}` : ""} · {i.occurrences}{" "}
                      occurrence{i.occurrences === 1 ? "" : "s"}
                    </p>
                  </article>
                ))
              )}
            </Card>
          </section>
        </>
      )}
    </div>
  );
}
