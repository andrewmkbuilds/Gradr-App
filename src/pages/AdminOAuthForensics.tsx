/**
 * /admin/oauth-forensics — full Google OAuth redirect chain for recent sign-ins.
 *
 * Admin-only (route is wrapped in <RequireAdmin>, reads are gated by RLS).
 * Every URL rendered or exported is redacted, so authorization codes and
 * tokens never reach the screen, the CSV or the PDF.
 */
import { useMemo, useState } from "react";
import { Download, FileText, Filter, RefreshCw, ShieldAlert, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { Button } from "@/components/ds/Button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Seo } from "@/components/Seo";
import { useOAuthForensics, type ForensicsFilters } from "@/hooks/useOAuthForensics";
import { downloadTimelineCsv, downloadTimelinePdf } from "@/lib/oauth/exports";
import { redactUrl } from "@/lib/oauth/redaction";
import { EXPECTED_FINAL_URL, type OAuthTimeline } from "@/lib/oauth/forensics";

const outcomeTone = (value: string) =>
  value === "ok" ? "default" : value === "not_applicable" ? "outline" : "destructive";

function TimelineCard({ timeline }: { timeline: OAuthTimeline }) {
  return (
    <Card tone={timeline.deviation ? "danger" : "default"}>
      <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <CardTitle className="truncate font-mono text-sm">{timeline.requestId}</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            {new Date(timeline.startedAt).toLocaleString()} · {timeline.hops.length} hop(s) ·{" "}
            {timeline.provider} · {timeline.accountType} account
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={outcomeTone(timeline.stateResult)}>state: {timeline.stateResult}</Badge>
          <Badge variant={outcomeTone(timeline.nonceResult)}>nonce: {timeline.nonceResult}</Badge>
          {timeline.deviation ? (
            <Badge variant="destructive" className="gap-1">
              <ShieldAlert aria-hidden="true" className="h-3 w-3" />
              {timeline.deviationTypes.join(", ") || "deviation"}
            </Badge>
          ) : (
            <Badge variant="secondary" className="gap-1">
              <ShieldCheck aria-hidden="true" className="h-3 w-3" />
              no deviation
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <ol className="space-y-2 border-l border-border pl-4">
          {timeline.hops.map((hop) => (
            <li key={hop.id} className="relative text-xs">
              <span
                aria-hidden="true"
                className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-primary"
              />
              <p className="font-medium text-foreground">
                {hop.stage}
                <span className="ml-2 font-normal text-muted-foreground">
                  {new Date(hop.created_at).toLocaleTimeString()}
                </span>
              </p>
              <p className="break-all text-muted-foreground">
                {redactUrl(hop.source_url) || "—"} → {redactUrl(hop.destination_url) || "—"}
              </p>
              {hop.note && <p className="break-all text-muted-foreground/80">{redactUrl(hop.note)}</p>}
            </li>
          ))}
        </ol>
        <p className="break-all text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Final destination:</span>{" "}
          {redactUrl(timeline.finalUrl) || "—"}{" "}
          {timeline.finalUrl && !timeline.deviation && <span>(expected {EXPECTED_FINAL_URL})</span>}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => downloadTimelineCsv([timeline])}>
            <Download aria-hidden="true" className="mr-2 h-4 w-4" /> CSV
          </Button>
          <Button size="sm" variant="outline" onClick={() => downloadTimelinePdf([timeline])}>
            <FileText aria-hidden="true" className="mr-2 h-4 w-4" /> PDF report
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminOAuthForensics() {
  const [filters, setFilters] = useState<ForensicsFilters>({
    accountType: "all",
    deviation: "all",
    stateResult: "all",
    nonceResult: "all",
    limit: 50,
  });
  const { data, isLoading, isFetching, refetch, error } = useOAuthForensics(filters);
  const timelines = useMemo(() => data ?? [], [data]);
  const deviations = timelines.filter((t) => t.deviation).length;

  const set = (patch: Partial<ForensicsFilters>) => setFilters((prev) => ({ ...prev, ...patch }));

  return (
    <div className="container space-y-6 py-6">
      <Seo path="/admin/oauth-forensics" title="OAuth forensics · Gradr admin" description="Google OAuth redirect chain audit." noindex />
      <PageHeader
        eyebrow="Security"
        title="Google OAuth forensics"
        description="Full redirect chain, state/nonce validation and deviation status for recent sign-ins. Credentials are redacted at the data layer."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw aria-hidden="true" className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => downloadTimelineCsv(timelines)}
              disabled={!timelines.length}
            >
              <Download aria-hidden="true" className="mr-2 h-4 w-4" /> Export CSV
            </Button>
            <Button size="sm" onClick={() => downloadTimelinePdf(timelines)} disabled={!timelines.length}>
              <FileText aria-hidden="true" className="mr-2 h-4 w-4" /> Incident PDF
            </Button>
          </div>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Filter aria-hidden="true" className="h-4 w-4" /> Filters
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="oauth-from">From</Label>
            <Input
              id="oauth-from"
              type="date"
              value={filters.from ?? ""}
              onChange={(e) => set({ from: e.target.value || undefined })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="oauth-to">To</Label>
            <Input
              id="oauth-to"
              type="date"
              value={filters.to ?? ""}
              onChange={(e) => set({ to: e.target.value || undefined })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="oauth-search">Search (user id, request id, URL)</Label>
            <Input
              id="oauth-search"
              value={filters.search ?? ""}
              placeholder="user id, request id or redirect host"
              onChange={(e) => set({ search: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="oauth-account">Google account type</Label>
            <Select
              value={filters.accountType}
              onValueChange={(v) => set({ accountType: v as ForensicsFilters["accountType"] })}
            >
              <SelectTrigger id="oauth-account">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="existing">Existing</SelectItem>
                <SelectItem value="new">New</SelectItem>
                <SelectItem value="unknown">Unknown</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="oauth-deviation">Deviation</Label>
            <Select
              value={filters.deviation}
              onValueChange={(v) => set({ deviation: v as ForensicsFilters["deviation"] })}
            >
              <SelectTrigger id="oauth-deviation">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All flows</SelectItem>
                <SelectItem value="deviations">Deviations only</SelectItem>
                <SelectItem value="clean">Clean only</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="oauth-state">State</Label>
              <Select
                value={filters.stateResult}
                onValueChange={(v) => set({ stateResult: v as ForensicsFilters["stateResult"] })}
              >
                <SelectTrigger id="oauth-state">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["all", "ok", "missing", "mismatch", "not_applicable"].map((v) => (
                    <SelectItem key={v} value={v}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="oauth-nonce">Nonce</Label>
              <Select
                value={filters.nonceResult}
                onValueChange={(v) => set({ nonceResult: v as ForensicsFilters["nonceResult"] })}
              >
                <SelectTrigger id="oauth-nonce">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["all", "ok", "missing", "mismatch", "not_applicable"].map((v) => (
                    <SelectItem key={v} value={v}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      ) : error ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-destructive">
            Could not load OAuth events. You need an admin role to read this log.
          </CardContent>
        </Card>
      ) : timelines.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No sign-in flows match these filters yet.
          </CardContent>
        </Card>
      ) : (
        <>
          <p className="text-sm text-muted-foreground" role="status">
            {timelines.length} sign-in flow(s) · {deviations} with deviations
          </p>
          <div className="space-y-4">
            {timelines.map((timeline) => (
              <TimelineCard key={timeline.requestId} timeline={timeline} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
