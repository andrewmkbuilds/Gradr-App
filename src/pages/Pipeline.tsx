import { useEffect, useMemo, useState } from "react";
import { invokeFunction } from "@/lib/invokeFunction";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
} from "@dnd-kit/core";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ExternalLink, Trash2, Bell, Loader2, Plus, Sparkles, Link2, FileText, Copy, Clock, CheckCircle2, AlarmClock } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { handleAiFunctionError } from "@/lib/aiErrors";
import { PipelineInsights } from "@/components/pipeline/PipelineInsights";

type Status = "saved" | "applied" | "interview" | "offer" | "rejected";

interface ApplicationPack {
  cover_letter?: { subject: string; body: string };
  recruiter_message?: { subject: string; body: string };
  bullet_rewrites?: { original_hint?: string; rewritten: string }[];
}

interface TrackedJob {
  id: string;
  title: string;
  company: string | null;
  location: string | null;
  remote: boolean | null;
  url: string | null;
  status: Status;
  match_score: number | null;
  applied_at: string | null;
  created_at: string;
  notes: string | null;
  application_pack: ApplicationPack | null;
  follow_up_enabled: boolean;
  follow_up_days: number;
  last_touch_at: string | null;
}

/** When the next nudge is due for an auto follow-up job, or null if it's off. */
function followUpDueAt(job: TrackedJob): Date | null {
  if (!job.follow_up_enabled) return null;
  const anchor = job.last_touch_at ?? job.applied_at ?? job.created_at;
  if (!anchor) return null;
  const due = new Date(anchor);
  due.setDate(due.getDate() + (job.follow_up_days || 5));
  return due;
}

interface Reminder {
  id: string;
  tracked_job_id: string;
  title: string;
  due_at: string;
  done: boolean;
}

const COLUMNS: { key: Status; label: string; tone: string }[] = [
  { key: "saved", label: "Saved", tone: "bg-muted/40" },
  { key: "applied", label: "Applied", tone: "bg-primary/10" },
  { key: "interview", label: "Interview", tone: "bg-warning/10" },
  { key: "offer", label: "Offer", tone: "bg-success/10" },
  { key: "rejected", label: "Rejected", tone: "bg-destructive/10" },
];

function JobCard({ job, onClick }: { job: TrackedJob; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: job.id });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={onClick}
      className={`p-3 rounded-lg bg-card border border-border hover:border-primary/40 cursor-grab active:cursor-grabbing transition-all ${
        isDragging ? "opacity-30" : ""
      }`}
    >
      <p className="text-sm font-medium text-foreground line-clamp-2">{job.title}</p>
      <p className="text-xs text-muted-foreground mt-1">{job.company || "Unknown"}</p>
      <div className="flex flex-wrap gap-1.5 mt-2">
        {typeof job.match_score === "number" && (
          <Badge className="text-[10px] bg-primary/15 text-primary border-primary/30">
            <Sparkles className="h-2.5 w-2.5 mr-0.5" />{job.match_score}%
          </Badge>
        )}
        {job.remote && <Badge variant="secondary" className="text-[10px]">Remote</Badge>}
        {(() => {
          const due = followUpDueAt(job);
          if (!due) return null;
          const overdue = due.getTime() <= Date.now();
          return (
            <Badge
              variant="secondary"
              className={`text-[10px] ${overdue ? "bg-warning/20 text-warning" : ""}`}
            >
              <Clock className="h-2.5 w-2.5 mr-0.5" />
              {overdue ? "Follow up now" : `Follow up ${formatDistanceToNow(due, { addSuffix: true })}`}
            </Badge>
          );
        })()}
      </div>
    </div>
  );
}

function Column({ status, label, tone, jobs, onCardClick }: {
  status: Status; label: string; tone: string; jobs: TrackedJob[]; onCardClick: (j: TrackedJob) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <div className="flex flex-col min-w-[260px] flex-1">
      <div className="flex items-center justify-between px-2 mb-2">
        <h3 className="text-sm font-semibold text-foreground">{label}</h3>
        <Badge variant="secondary" className="text-xs">{jobs.length}</Badge>
      </div>
      <div
        ref={setNodeRef}
        className={`flex-1 rounded-xl p-2 space-y-2 min-h-[400px] transition-colors ${tone} ${isOver ? "ring-2 ring-primary/40" : ""}`}
      >
        {jobs.map((job) => <JobCard key={job.id} job={job} onClick={() => onCardClick(job)} />)}
        {jobs.length === 0 && <p className="text-xs text-muted-foreground text-center py-8">Drop here</p>}
      </div>
    </div>
  );
}

export default function Pipeline() {
  const { user } = useAuth();
  const [jobs, setJobs] = useState<TrackedJob[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selected, setSelected] = useState<TrackedJob | null>(null);
  const [reminderTitle, setReminderTitle] = useState("");
  const [reminderDue, setReminderDue] = useState("");
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteUrl, setPasteUrl] = useState("");
  const [pasting, setPasting] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  useEffect(() => {
    if (user) load();
  }, [user]);

  const load = async () => {
    setLoading(true);
    const [jRes, rRes] = await Promise.all([
      supabase.from("tracked_jobs").select("*").eq("user_id", user!.id).order("created_at", { ascending: false }),
      supabase.from("job_reminders").select("*").eq("user_id", user!.id).eq("done", false).order("due_at"),
    ]);
    setJobs((jRes.data || []) as TrackedJob[]);
    setReminders((rRes.data || []) as Reminder[]);
    setLoading(false);
  };

  const grouped = useMemo(() => {
    const m: Record<Status, TrackedJob[]> = { saved: [], applied: [], interview: [], offer: [], rejected: [] };
    for (const j of jobs) m[j.status]?.push(j);
    return m;
  }, [jobs]);

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));
  const onDragEnd = async (e: DragEndEvent) => {
    setActiveId(null);
    const id = String(e.active.id);
    const newStatus = e.over?.id as Status | undefined;
    if (!newStatus || !COLUMNS.find((c) => c.key === newStatus)) return;
    const job = jobs.find((j) => j.id === id);
    if (!job || job.status === newStatus) return;

    setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, status: newStatus } : j)));
    const updates: { status: Status; applied_at?: string } = { status: newStatus };
    if (newStatus === "applied" && !job.applied_at) updates.applied_at = new Date().toISOString();
    const { error } = await supabase.from("tracked_jobs").update(updates).eq("id", id);
    if (error) {
      toast.error("Failed to update");
      load();
    }
  };

  const deleteJob = async (id: string) => {
    setJobs((p) => p.filter((j) => j.id !== id));
    setSelected(null);
    await supabase.from("tracked_jobs").delete().eq("id", id);
    toast.success("Removed");
  };

  const addReminder = async () => {
    if (!selected || !reminderTitle || !reminderDue) return;
    const { error } = await supabase.from("job_reminders").insert({
      user_id: user!.id,
      tracked_job_id: selected.id,
      title: reminderTitle,
      due_at: new Date(reminderDue).toISOString(),
    });
    if (error) return toast.error(error.message);
    toast.success("Reminder set");
    setReminderTitle("");
    setReminderDue("");
    load();
  };

  const completeReminder = async (id: string) => {
    setReminders((r) => r.filter((x) => x.id !== id));
    await supabase.from("job_reminders").update({ done: true }).eq("id", id);
  };

  const patchJob = async (id: string, updates: Partial<TrackedJob>) => {
    setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, ...updates } : j)));
    setSelected((cur) => (cur && cur.id === id ? { ...cur, ...updates } : cur));
    const { error } = await supabase
      .from("tracked_jobs")
      .update(updates as never)
      .eq("id", id);
    if (error) {
      toast.error("Couldn't save follow-up settings");
      load();
    }
  };

  const markTouched = async (job: TrackedJob) => {
    await patchJob(job.id, { last_touch_at: new Date().toISOString() });
    toast.success("Follow-up clock reset");
  };

  const addFromUrl = async () => {
    if (!pasteUrl.trim()) return;
    setPasting(true);
    try {
      const { data, error } = await invokeFunction("parse-job-url", {
        body: { url: pasteUrl.trim() },
      });
      if (error || data?.error) {
        if (!handleAiFunctionError(error, data)) toast.error(data?.error || "Failed");
        return;
      }
      const { error: insErr } = await supabase.from("tracked_jobs").insert({
        user_id: user!.id,
        source: "manual",
        title: data.title || "Untitled",
        company: data.company,
        location: data.location,
        remote: !!data.remote,
        url: pasteUrl.trim(),
        description: data.description,
        salary_min: data.salary_min,
        salary_max: data.salary_max,
        status: "saved",
      });
      if (insErr) throw insErr;
      setPasteUrl("");
      setPasteOpen(false);
      toast.success("Added to pipeline");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setPasting(false);
    }
  };

  const activeJob = activeId ? jobs.find((j) => j.id === activeId) : null;

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="max-w-[1400px] mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Application Pipeline</h1>
          <p className="text-sm text-muted-foreground mt-1">Drag jobs across stages. Track every opportunity.</p>
        </div>
        <Dialog open={pasteOpen} onOpenChange={setPasteOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2"><Plus className="h-4 w-4" /> Add job</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add a job by URL</DialogTitle>
              <DialogDescription>Paste any job posting URL — AI will extract the details automatically.</DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label>Job URL</Label>
              <div className="relative">
                <Link2 className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input value={pasteUrl} onChange={(e) => setPasteUrl(e.target.value)} placeholder="https://…" className="pl-10" />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={addFromUrl} disabled={pasting || !pasteUrl.trim()} className="gap-2">
                {pasting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Extract & add
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <PipelineInsights
        jobs={jobs}
        onOpenJob={(id) => {
          const job = jobs.find((j) => j.id === id);
          if (job) setSelected(job);
        }}
      />

      {/* Reminders bar */}
      {reminders.length > 0 && (
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Bell className="h-4 w-4 text-warning" />
            <h3 className="text-sm font-semibold">Upcoming reminders</h3>
          </div>
          <div className="space-y-2">
            {reminders.slice(0, 5).map((r) => {
              const job = jobs.find((j) => j.id === r.tracked_job_id);
              const overdue = new Date(r.due_at) < new Date();
              return (
                <div key={r.id} className="flex items-center justify-between gap-3 p-2 rounded-lg bg-secondary/50">
                  <div className="min-w-0">
                    <p className="text-sm text-foreground truncate">{r.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {job?.title || "Job"} · <span className={overdue ? "text-destructive" : ""}>{formatDistanceToNow(new Date(r.due_at), { addSuffix: true })}</span>
                    </p>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => completeReminder(r.id)}>Done</Button>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-4">
          {COLUMNS.map((c) => (
            <Column key={c.key} status={c.key} label={c.label} tone={c.tone} jobs={grouped[c.key]} onCardClick={setSelected} />
          ))}
        </div>
        <DragOverlay>
          {activeJob ? (
            <div className="p-3 rounded-lg bg-card border-2 border-primary shadow-lg w-[260px]">
              <p className="text-sm font-medium">{activeJob.title}</p>
              <p className="text-xs text-muted-foreground">{activeJob.company}</p>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Detail dialog */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-lg">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="pr-8">{selected.title}</DialogTitle>
                <DialogDescription>{selected.company || "Unknown"} · {selected.location || "—"}</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">{selected.status}</Badge>
                  {typeof selected.match_score === "number" && (
                    <Badge className="bg-primary/15 text-primary border-primary/30">{selected.match_score}% match</Badge>
                  )}
                  {selected.applied_at && <Badge variant="secondary">Applied {formatDistanceToNow(new Date(selected.applied_at), { addSuffix: true })}</Badge>}
                </div>
                {selected.url && (
                  <Button variant="outline" className="w-full gap-2" onClick={() => window.open(selected.url!, "_blank")}>
                    <ExternalLink className="h-4 w-4" /> Open job posting
                  </Button>
                )}

                {selected.application_pack && (
                  <div className="space-y-3 pt-2 border-t border-border max-h-[300px] overflow-y-auto">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-primary" />
                      <Label className="text-xs uppercase tracking-wider text-primary">AI Application Pack</Label>
                    </div>
                    {selected.application_pack.cover_letter && (
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                            <FileText className="h-3 w-3" /> Cover letter
                          </p>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 px-2 text-xs gap-1"
                            onClick={() => {
                              navigator.clipboard.writeText(selected.application_pack!.cover_letter!.body);
                              toast.success("Cover letter copied");
                            }}
                          >
                            <Copy className="h-3 w-3" /> Copy
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground italic">{selected.application_pack.cover_letter.subject}</p>
                        <Textarea
                          readOnly
                          value={selected.application_pack.cover_letter.body}
                          className="text-xs h-32 resize-none"
                        />
                      </div>
                    )}
                    {selected.application_pack.bullet_rewrites && selected.application_pack.bullet_rewrites.length > 0 && (
                      <div className="space-y-1.5">
                        <p className="text-xs font-semibold text-foreground">Resume bullet rewrites</p>
                        <ul className="space-y-1.5 text-xs">
                          {selected.application_pack.bullet_rewrites.map((b, i) => (
                            <li key={i} className="p-2 rounded-sm bg-secondary/50 text-foreground">
                              {b.rewritten}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {selected.application_pack.recruiter_message && (
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-semibold text-foreground">Recruiter outreach</p>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 px-2 text-xs gap-1"
                            onClick={() => {
                              navigator.clipboard.writeText(selected.application_pack!.recruiter_message!.body);
                              toast.success("Message copied");
                            }}
                          >
                            <Copy className="h-3 w-3" /> Copy
                          </Button>
                        </div>
                        <Textarea
                          readOnly
                          value={selected.application_pack.recruiter_message.body}
                          className="text-xs h-20 resize-none"
                        />
                      </div>
                    )}
                  </div>
                )}

                <div className="space-y-3 pt-2 border-t border-border">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <Label htmlFor="followup-toggle" className="text-xs uppercase tracking-wider text-muted-foreground">
                        Automatic follow-up
                      </Label>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Gradr nudges you on your dashboard when this one goes quiet.
                      </p>
                    </div>
                    <Switch
                      id="followup-toggle"
                      checked={selected.follow_up_enabled}
                      onCheckedChange={(v) => patchJob(selected.id, { follow_up_enabled: v })}
                    />
                  </div>

                  {selected.follow_up_enabled && (
                    <div className="space-y-2 rounded-lg bg-secondary/40 p-3">
                      <div className="flex items-center gap-2">
                        <Label className="text-xs text-muted-foreground shrink-0">Nudge me after</Label>
                        <Select
                          value={String(selected.follow_up_days || 5)}
                          onValueChange={(v) => patchJob(selected.id, { follow_up_days: Number(v) })}
                        >
                          <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {[3, 5, 7, 10, 14, 21].map((d) => (
                              <SelectItem key={d} value={String(d)}>{d} days</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      {(() => {
                        const due = followUpDueAt(selected);
                        if (!due) return null;
                        const overdue = due.getTime() <= Date.now();
                        return (
                          <p className={`flex items-center gap-1.5 text-xs ${overdue ? "text-warning" : "text-muted-foreground"}`}>
                            <AlarmClock className="h-3 w-3" />
                            {overdue ? "Due now" : `Next nudge ${formatDistanceToNow(due, { addSuffix: true })}`}
                          </p>
                        );
                      })()}
                      <Button size="sm" variant="outline" className="w-full gap-2" onClick={() => markTouched(selected)}>
                        <CheckCircle2 className="h-3.5 w-3.5" /> I followed up today
                      </Button>
                    </div>
                  )}
                </div>

                <div className="space-y-2 pt-2 border-t border-border">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">Add reminder</Label>
                  <Input placeholder="e.g. Follow up with recruiter" value={reminderTitle} onChange={(e) => setReminderTitle(e.target.value)} />
                  <Input type="datetime-local" value={reminderDue} onChange={(e) => setReminderDue(e.target.value)} />
                  <Button onClick={addReminder} disabled={!reminderTitle || !reminderDue} className="w-full gap-2">
                    <Bell className="h-4 w-4" /> Set reminder
                  </Button>
                </div>
              </div>
              <DialogFooter>
                <Button variant="destructive" onClick={() => deleteJob(selected.id)} className="gap-2">
                  <Trash2 className="h-4 w-4" /> Remove
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
