import { useCallback, useMemo, useRef, useState } from "react";
import { toPng } from "html-to-image";
import {
  Camera,
  CheckCircle2,
  Circle,
  Download,
  ExternalLink,
  Monitor,
  RotateCcw,
  Smartphone,
  Tablet,
  XCircle,
} from "lucide-react";
import { Seo } from "@/components/Seo";
import { DashboardLayout } from "@/components/DashboardLayout";
import { PageHeader } from "@/components/app/PageHeader";
import { Surface } from "@/components/ui/surface";
import { Button } from "@/components/ds/Button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { safeStorage } from "@/lib/safeStorage";
import { cn } from "@/lib/utils";
import {
  QA_GROUPS,
  QA_ROUTES,
  STATE_LABEL,
  qaPreviewUrl,
  totalChecks,
  type QaRoute,
  type QaState,
} from "@/lib/qa/routes";

/**
 * Final QA checklist.
 *
 * Every major route is rendered in a same-origin frame and driven through its
 * loading, empty and error presentations via the `?qa=` override, at three
 * viewport widths. Reviewers mark each cell pass/fail, leave a note, and can
 * capture a PNG of exactly what they are looking at in one click.
 */

type Verdict = "pass" | "fail" | null;

interface CellRecord {
  verdict: Verdict;
  note?: string;
  checkedAt?: string;
}

const STORAGE_KEY = "gradr-qa-checklist";

const DEVICES = [
  { id: "mobile", label: "Mobile", width: 390, height: 780, icon: Smartphone },
  { id: "tablet", label: "Tablet", width: 834, height: 900, icon: Tablet },
  { id: "desktop", label: "Desktop", width: 1440, height: 900, icon: Monitor },
] as const;

type DeviceId = (typeof DEVICES)[number]["id"];

const cellKey = (routeId: string, state: QaState) => `${routeId}:${state}`;

export default function AdminQaChecklist() {
  const [records, setRecords] = useState<Record<string, CellRecord>>(() =>
    safeStorage.getJSON<Record<string, CellRecord>>(STORAGE_KEY, {}),
  );
  const [routeId, setRouteId] = useState(QA_ROUTES[0].id);
  const [state, setState] = useState<QaState>("default");
  const [device, setDevice] = useState<DeviceId>("desktop");
  const [capturing, setCapturing] = useState(false);
  const frameRef = useRef<HTMLIFrameElement>(null);

  const route = useMemo(
    () => QA_ROUTES.find((r) => r.id === routeId) ?? QA_ROUTES[0],
    [routeId],
  );
  const activeState = route.states.includes(state) ? state : route.states[0];
  const deviceSpec = DEVICES.find((d) => d.id === device)!;
  const previewUrl = useMemo(
    () => qaPreviewUrl(route, activeState),
    [route, activeState],
  );

  const total = totalChecks();
  const reviewed = Object.values(records).filter((r) => r.verdict).length;
  const failed = Object.values(records).filter((r) => r.verdict === "fail").length;

  const persist = useCallback((next: Record<string, CellRecord>) => {
    setRecords(next);
    safeStorage.setJSON(STORAGE_KEY, next);
  }, []);

  const setVerdict = useCallback(
    (verdict: Verdict) => {
      const key = cellKey(route.id, activeState);
      persist({
        ...records,
        [key]: { ...records[key], verdict, checkedAt: new Date().toISOString() },
      });
    },
    [activeState, persist, records, route.id],
  );

  const setNote = useCallback(
    (note: string) => {
      const key = cellKey(route.id, activeState);
      persist({ ...records, [key]: { ...records[key], verdict: records[key]?.verdict ?? null, note } });
    },
    [activeState, persist, records, route.id],
  );

  /** Screenshots exactly what the frame is showing right now. */
  const capture = useCallback(async () => {
    const doc = frameRef.current?.contentDocument;
    const node = doc?.body;
    if (!node) {
      toast({
        title: "Nothing to capture",
        description: "The preview frame has not finished loading yet.",
        variant: "destructive",
      });
      return;
    }
    setCapturing(true);
    try {
      const dataUrl = await toPng(node, {
        backgroundColor: getComputedStyle(doc.documentElement).backgroundColor || undefined,
        pixelRatio: 2,
        width: deviceSpec.width,
        cacheBust: true,
      });
      const link = document.createElement("a");
      link.download = `gradr-qa-${route.id}-${activeState}-${device}.png`;
      link.href = dataUrl;
      link.click();
      toast({ title: "Screenshot saved", description: link.download });
    } catch (error) {
      console.error("[qa] capture failed", error);
      toast({
        title: "Couldn't capture the frame",
        description: "Try reloading the preview and capturing again.",
        variant: "destructive",
      });
    } finally {
      setCapturing(false);
    }
  }, [activeState, device, deviceSpec.width, route.id]);

  const exportReport = useCallback(() => {
    const rows = QA_ROUTES.flatMap((r) =>
      r.states.map((s) => {
        const record = records[cellKey(r.id, s)];
        return {
          route: r.path,
          label: r.label,
          group: r.group,
          state: s,
          verdict: record?.verdict ?? "unreviewed",
          note: record?.note ?? "",
          checkedAt: record?.checkedAt ?? "",
        };
      }),
    );
    const blob = new Blob([JSON.stringify({ generatedAt: new Date().toISOString(), rows }, null, 2)], {
      type: "application/json",
    });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `gradr-qa-report-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  }, [records]);

  const current = records[cellKey(route.id, activeState)];

  return (
    <DashboardLayout>
      <Seo
        title="Final QA checklist"
        description="Verify loading, empty and error states across every major Gradr route."
        path="/admin/qa-checklist"
        noindex
      />
      <PageHeader
        eyebrow="Quality"
        title="Final QA checklist"
        description="Drive every major route through its loading, empty and error states at three viewport widths, then capture evidence in one click."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={exportReport}>
              <Download className="h-4 w-4" aria-hidden />
              Export report
            </Button>
            <Button
              variant="ghost"
              onClick={() => persist({})}
              aria-label="Reset every QA verdict"
            >
              <RotateCcw className="h-4 w-4" aria-hidden />
              Reset
            </Button>
          </div>
        }
        meta={
          <div className="flex w-full max-w-md flex-col gap-2">
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <span>
                {reviewed} of {total} checks reviewed
              </span>
              {failed > 0 && (
                <Badge variant="destructive">{failed} failing</Badge>
              )}
            </div>
            <Progress value={(reviewed / total) * 100} aria-label="QA completion" />
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
        {/* Route list */}
        <Surface level={2} flush className="max-h-[70vh] overflow-y-auto p-3">
          <nav aria-label="QA routes">
            {QA_GROUPS.map((group) => {
              const routes = QA_ROUTES.filter((r) => r.group === group);
              if (!routes.length) return null;
              return (
                <div key={group} className="mb-4">
                  <p className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {group}
                  </p>
                  <ul className="space-y-1">
                    {routes.map((r) => (
                      <li key={r.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setRouteId(r.id);
                            setState(r.states[0]);
                          }}
                          aria-current={r.id === route.id ? "true" : undefined}
                          className={cn(
                            "flex min-h-11 w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                            r.id === route.id
                              ? "bg-accent/10 font-medium text-foreground"
                              : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                          )}
                        >
                          <span className="truncate">{r.label}</span>
                          <RouteStatus route={r} records={records} />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </nav>
        </Surface>

        {/* Preview + verdict */}
        <div className="space-y-4">
          <Surface level={2} className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-foreground">{route.label}</h2>
                <p className="text-sm text-muted-foreground">
                  <code>{route.path}</code>
                  {route.auth && <span className="ml-2">· requires sign-in</span>}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {DEVICES.map((d) => {
                  const Icon = d.icon;
                  return (
                    <Button
                      key={d.id}
                      size="sm"
                      variant={d.id === device ? "default" : "outline"}
                      onClick={() => setDevice(d.id)}
                      aria-pressed={d.id === device}
                    >
                      <Icon className="h-4 w-4" aria-hidden />
                      {d.label}
                    </Button>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-wrap gap-2" role="tablist" aria-label="UI states">
              {route.states.map((s) => (
                <Button
                  key={s}
                  role="tab"
                  aria-selected={s === activeState}
                  size="sm"
                  variant={s === activeState ? "secondary" : "ghost"}
                  onClick={() => setState(s)}
                >
                  {STATE_LABEL[s]}
                </Button>
              ))}
            </div>

            <div className="overflow-x-auto rounded-xl border border-border bg-surface-secondary p-3">
              <iframe
                ref={frameRef}
                key={`${previewUrl}-${device}`}
                title={`${route.label} — ${STATE_LABEL[activeState]} state preview`}
                src={previewUrl}
                width={deviceSpec.width}
                height={deviceSpec.height}
                className="mx-auto block rounded-lg border border-border bg-background"
                loading="lazy"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={capture} disabled={capturing}>
                <Camera className="h-4 w-4" aria-hidden />
                {capturing ? "Capturing…" : "Capture screenshot"}
              </Button>
              <Button
                variant={current?.verdict === "pass" ? "default" : "outline"}
                onClick={() => setVerdict("pass")}
              >
                <CheckCircle2 className="h-4 w-4" aria-hidden />
                Pass
              </Button>
              <Button
                variant={current?.verdict === "fail" ? "destructive" : "outline"}
                onClick={() => setVerdict("fail")}
              >
                <XCircle className="h-4 w-4" aria-hidden />
                Fail
              </Button>
              <Button variant="ghost" asChild>
                <a href={previewUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-4 w-4" aria-hidden />
                  Open in new tab
                </a>
              </Button>
            </div>

            <div className="space-y-2">
              <label htmlFor="qa-note" className="text-sm font-medium text-foreground">
                Reviewer note
              </label>
              <Textarea
                id="qa-note"
                value={current?.note ?? ""}
                onChange={(event) => setNote(event.target.value)}
                placeholder="What looks wrong, and where?"
                rows={3}
              />
            </div>
          </Surface>
        </div>
      </div>
    </DashboardLayout>
  );
}

/** Compact per-route roll-up shown in the route list. */
function RouteStatus({ route, records }: { route: QaRoute; records: Record<string, CellRecord> }) {
  const verdicts = route.states.map((s) => records[cellKey(route.id, s)]?.verdict ?? null);
  const failing = verdicts.some((v) => v === "fail");
  const done = verdicts.every((v) => v === "pass");
  const label = failing ? "has failures" : done ? "all states pass" : "not fully reviewed";

  return (
    <span className="flex items-center gap-1 text-xs" title={label}>
      <span className="sr-only">{label}</span>
      {failing ? (
        <XCircle className="h-4 w-4 text-destructive" aria-hidden />
      ) : done ? (
        <CheckCircle2 className="h-4 w-4 text-primary" aria-hidden />
      ) : (
        <Circle className="h-4 w-4 text-muted-foreground" aria-hidden />
      )}
      <span className="tabular-nums text-muted-foreground">
        {verdicts.filter(Boolean).length}/{verdicts.length}
      </span>
    </span>
  );
}
