import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { AlarmClock, Bell, Check, Loader2, Settings2 } from "lucide-react";
import { Surface, SurfaceHeader } from "@/components/ui/surface";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface ActiveJob {
  id: string;
  title: string;
  company: string | null;
  status: string;
  applied_at: string | null;
  updated_at: string;
  created_at: string;
  last_touch_at: string | null;
  /** Per-application cadence override. 0 = inherit the global cadence. */
  follow_up_days: number | null;
  follow_up_enabled: boolean | null;
}

interface Settings {
  followup_enabled: boolean;
  followup_days: number;
  followup_stages: string[];
}

const STAGE_OPTIONS = [
  { value: "applied", label: "Applied" },
  { value: "interview", label: "Interview" },
  { value: "saved", label: "Saved" },
  { value: "offer", label: "Offer" },
];

const CADENCES = [3, 5, 7, 10, 14];

function lastTouch(job: ActiveJob) {
  return new Date(job.last_touch_at ?? job.applied_at ?? job.updated_at ?? job.created_at);
}

/** Cadence actually applied to a job: its own override, else the global setting. */
function cadenceFor(job: ActiveJob, fallback: number) {
  return job.follow_up_days && job.follow_up_days > 0 ? job.follow_up_days : fallback;
}


/**
 * Follow-up reminders: reads each active application's last-touch date and
 * proposes a nudge once the configured cadence has elapsed. Creating a nudge
 * writes a real row into job_reminders so it shows up everywhere else too.
 */
export function FollowUpReminders() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<ActiveJob[]>([]);
  const [existing, setExisting] = useState<Set<string>>(new Set());
  const [settings, setSettings] = useState<Settings>({
    followup_enabled: true,
    followup_days: 5,
    followup_stages: ["applied", "interview"],
  });
  const [loading, setLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const [jobsRes, remRes, prefRes] = await Promise.all([
      supabase
        .from("tracked_jobs")
        .select("id, title, company, status, applied_at, updated_at, created_at")
        .eq("user_id", user.id)
        .in("status", ["saved", "applied", "interview", "offer"])
        .order("updated_at", { ascending: true })
        .limit(50),
      supabase.from("job_reminders").select("tracked_job_id").eq("user_id", user.id).eq("done", false),
      supabase
        .from("user_preferences")
        .select("followup_enabled, followup_days, followup_stages")
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);
    setJobs((jobsRes.data ?? []) as ActiveJob[]);
    setExisting(new Set((remRes.data ?? []).map((r) => r.tracked_job_id)));
    if (prefRes.data) {
      setSettings({
        followup_enabled: prefRes.data.followup_enabled ?? true,
        followup_days: prefRes.data.followup_days ?? 5,
        followup_stages: prefRes.data.followup_stages ?? ["applied", "interview"],
      });
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  const saveSettings = async (next: Settings) => {
    setSettings(next);
    if (!user) return;
    const { error } = await supabase
      .from("user_preferences")
      .upsert({ user_id: user.id, ...next }, { onConflict: "user_id" });
    if (error) toast.error("Couldn't save reminder settings");
  };

  const due = useMemo(() => {
    if (!settings.followup_enabled) return [];
    const cutoff = Date.now() - settings.followup_days * 86_400_000;
    return jobs
      .filter((j) => settings.followup_stages.includes(j.status))
      .filter((j) => lastTouch(j).getTime() <= cutoff)
      .filter((j) => !existing.has(j.id))
      .slice(0, 6);
  }, [jobs, settings, existing]);

  const createReminder = async (job: ActiveJob) => {
    if (!user) return;
    setBusyId(job.id);
    const dueAt = new Date();
    dueAt.setHours(dueAt.getHours() + 24);
    const { error } = await supabase.from("job_reminders").insert({
      user_id: user.id,
      tracked_job_id: job.id,
      title: `Follow up on ${job.title}${job.company ? ` at ${job.company}` : ""}`,
      due_at: dueAt.toISOString(),
    });
    setBusyId(null);
    if (error) {
      toast.error("Couldn't create that reminder");
      return;
    }
    setExisting((prev) => new Set(prev).add(job.id));
    toast.success("Follow-up scheduled for tomorrow");
  };

  const createAll = async () => {
    for (const job of due) await createReminder(job);
  };

  return (
    <Surface level={2}>
      <SurfaceHeader
        title="Follow-ups due"
        icon={AlarmClock}
        action={
          <Button
            size="sm"
            variant="ghost"
            className="gap-1.5 text-xs"
            onClick={() => setShowSettings((v) => !v)}
            aria-expanded={showSettings}
          >
            <Settings2 className="h-3.5 w-3.5" aria-hidden="true" />
            {showSettings ? "Hide settings" : "Settings"}
          </Button>
        }
      />

      {showSettings && (
        <div className="elev-1 mb-4 space-y-4 rounded-lg p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="fu-enabled" className="text-sm">Suggest follow-ups</Label>
              <p className="text-xs text-muted-foreground">Nudge me when an application goes quiet.</p>
            </div>
            <Switch
              id="fu-enabled"
              checked={settings.followup_enabled}
              onCheckedChange={(v) => saveSettings({ ...settings, followup_enabled: v })}
            />
          </div>

          <div className="flex items-center justify-between gap-4">
            <Label className="text-sm">Nudge after</Label>
            <Select
              value={String(settings.followup_days)}
              onValueChange={(v) => saveSettings({ ...settings, followup_days: Number(v) })}
            >
              <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CADENCES.map((d) => <SelectItem key={d} value={String(d)}>{d} days of silence</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-sm">Stages to track</Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {STAGE_OPTIONS.map((s) => {
                const on = settings.followup_stages.includes(s.value);
                return (
                  <button
                    key={s.value}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      saveSettings({
                        ...settings,
                        followup_stages: on
                          ? settings.followup_stages.filter((x) => x !== s.value)
                          : [...settings.followup_stages, s.value],
                      })
                    }
                    className={cn(
                      "min-h-9 rounded-full border px-3 text-xs transition-colors",
                      on ? "border-mahogany-border bg-mahogany-soft text-mahogany-strong" : "border-border text-muted-foreground hover:border-mahogany/40",
                    )}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          {[0, 1].map((i) => <div key={i} className="h-14 animate-pulse rounded-lg bg-secondary/60" />)}
        </div>
      ) : !settings.followup_enabled ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Follow-up suggestions are turned off.</p>
      ) : due.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Nothing has gone quiet for {settings.followup_days} days. Applications with reminders already set are hidden.
        </p>
      ) : (
        <>
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              {due.length} application{due.length === 1 ? "" : "s"} untouched for {settings.followup_days}+ days.
            </p>
            <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={createAll}>
              <Bell className="h-3.5 w-3.5" aria-hidden="true" /> Schedule all
            </Button>
          </div>
          <ul className="space-y-2">
            {due.map((job) => (
              <li key={job.id} className="elev-1 flex items-center justify-between gap-3 rounded-lg p-3">
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() => navigate("/pipeline")}
                >
                  <p className="truncate text-sm font-medium text-foreground">{job.title}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {job.company || "Unknown company"} · last touch {formatDistanceToNow(lastTouch(job), { addSuffix: true })}
                  </p>
                </button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="shrink-0 gap-1.5 text-xs"
                  disabled={busyId === job.id}
                  onClick={() => createReminder(job)}
                >
                  {busyId === job.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  Remind me
                </Button>
              </li>
            ))}
          </ul>
        </>
      )}
    </Surface>
  );
}
