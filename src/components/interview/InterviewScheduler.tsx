import { useEffect, useMemo, useState } from "react";
import { CalendarClock, CalendarPlus, RefreshCw, ExternalLink, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useScheduledInterviews } from "@/hooks/useScheduledInterviews";

function defaultSlot() {
  const d = new Date(Date.now() + 3_600_000);
  d.setMinutes(0, 0, 0);
  // datetime-local wants a local ISO string without the timezone suffix.
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function whenLabel(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Schedule mock interviews and pull real interview times in from Google
 * Calendar so Interview Studio knows what you're actually preparing for.
 */
export function InterviewScheduler({ defaultRole }: { defaultRole?: string }) {
  const { items, loading, busy, calendarError, importCalendar, scheduleMock, cancel } =
    useScheduledInterviews();
  const [title, setTitle] = useState("");
  const [startsAt, setStartsAt] = useState(defaultSlot);
  const [duration, setDuration] = useState(30);

  useEffect(() => {
    if (defaultRole && !title) setTitle(`Mock interview — ${defaultRole}`);
  }, [defaultRole, title]);

  const upcoming = useMemo(() => items.filter((i) => i.status !== "canceled"), [items]);

  const onSchedule = async () => {
    if (!title.trim()) return toast.error("Give the session a title first.");
    if (!startsAt || Number.isNaN(Date.parse(startsAt))) return toast.error("Pick a valid time.");
    const ok = await scheduleMock({
      title: title.trim(),
      startsAt: new Date(startsAt).toISOString(),
      durationMin: duration,
      targetRole: defaultRole,
    });
    toast[ok ? "success" : "error"](
      ok ? "Interview scheduled." : "Couldn't schedule that session.",
    );
  };

  const onImport = async () => {
    const count = await importCalendar(false);
    toast.success(count ? `Imported ${count} interview${count === 1 ? "" : "s"}.` : "No new interviews found.");
  };

  return (
    <Card className="glass-panel space-y-5 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Interview schedule</h3>
        </div>
        <Button variant="outline" size="sm" onClick={onImport} disabled={busy}>
          <RefreshCw className={`mr-2 h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} />
          Sync calendar
        </Button>
      </div>

      {calendarError && (
        <p className="rounded-lg border border-border/60 bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          {calendarError}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end">
        <div className="space-y-1.5">
          <Label htmlFor="sched-title" className="text-xs">Session</Label>
          <Input
            id="sched-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Mock interview — Product Manager"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sched-when" className="text-xs">Starts</Label>
          <Input
            id="sched-when"
            type="datetime-local"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sched-len" className="text-xs">Minutes</Label>
          <Input
            id="sched-len"
            type="number"
            min={5}
            max={120}
            className="w-24"
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
          />
        </div>
        <Button onClick={onSchedule} disabled={busy} className="press-scale">
          <CalendarPlus className="mr-2 h-4 w-4" />
          Schedule
        </Button>
      </div>

      <div className="space-y-2">
        {loading && <p className="text-xs text-muted-foreground">Loading your schedule…</p>}
        {!loading && upcoming.length === 0 && (
          <p className="text-xs text-muted-foreground">
            Nothing scheduled yet. Book a mock session or sync your calendar to pull real interviews in.
          </p>
        )}
        {upcoming.map((item) => (
          <div
            key={item.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-surface-elevated/60 px-3 py-2.5"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-medium">{item.title}</span>
                <Badge variant={item.kind === "mock" ? "secondary" : "outline"} className="text-[10px]">
                  {item.kind === "mock" ? "Mock" : "Real"}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {whenLabel(item.starts_at)}
                {item.location ? ` · ${item.location}` : ""}
              </p>
            </div>
            <div className="flex items-center gap-1">
              {item.html_link && (
                <Button asChild variant="ghost" size="sm">
                  <a href={item.html_link} target="_blank" rel="noopener noreferrer" aria-label="Open in Google Calendar">
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={() => cancel(item.id)} aria-label={`Cancel ${item.title}`}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
