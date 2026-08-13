/**
 * Follow-up reminders for active applications.
 *
 * Every applied/interviewing job gets a cadence (in days) measured from its
 * last-touch date. The card surfaces what's due now, lets you tune the cadence
 * per application, switch reminders off, and log a touch — which resets the
 * clock and clears the nudge.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { BellRing, Check, Clock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type JobPatch = {
  follow_up_enabled?: boolean;
  follow_up_days?: number;
  last_touch_at?: string;
};

const CADENCE_OPTIONS = [2, 3, 5, 7, 10, 14];
const ACTIVE_STAGES = ["applied", "interview"];

interface FollowUpJob {
  id: string;
  title: string;
  company: string | null;
  status: string;
  applied_at: string | null;
  created_at: string;
  last_touch_at: string | null;
  follow_up_enabled: boolean | null;
  follow_up_days: number | null;
}

function dueAt(job: FollowUpJob): Date | null {
  if (job.follow_up_enabled === false) return null;
  const anchor = job.last_touch_at ?? job.applied_at ?? job.created_at;
  if (!anchor) return null;
  const due = new Date(anchor);
  due.setDate(due.getDate() + (job.follow_up_days || 5));
  return due;
}

export function FollowUpReminders() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["follow-up-reminders", user?.id],
    enabled: !!user,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tracked_jobs")
        .select(
          "id,title,company,status,applied_at,created_at,last_touch_at,follow_up_enabled,follow_up_days",
        )
        .in("status", ACTIVE_STAGES)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as unknown as FollowUpJob[];
    },
  });

  const patch = useMutation({
    mutationFn: async ({ id, values }: { id: string; values: JobPatch }) => {
      const { error } = await supabase.from("tracked_jobs").update(values).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["follow-up-reminders", user?.id] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const jobs = useMemo(() => {
    const list = data ?? [];
    return [...list].sort((a, b) => {
      const da = dueAt(a)?.getTime() ?? Number.POSITIVE_INFINITY;
      const db = dueAt(b)?.getTime() ?? Number.POSITIVE_INFINITY;
      return da - db;
    });
  }, [data]);

  const overdue = jobs.filter((j) => {
    const due = dueAt(j);
    return due !== null && due.getTime() <= Date.now();
  });

  if (isLoading || jobs.length === 0) return null;

  const visible = expanded ? jobs : jobs.slice(0, 3);

  return (
    <section className="glass-card p-5 space-y-4" aria-labelledby="followups-heading">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2
            id="followups-heading"
            className="flex items-center gap-2 text-sm font-semibold text-foreground"
          >
            <BellRing className="h-4 w-4 text-primary" aria-hidden />
            Follow-up reminders
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {overdue.length > 0
              ? `${overdue.length} application${overdue.length === 1 ? "" : "s"} need a nudge today.`
              : "Everything is on schedule — nothing due right now."}
          </p>
        </div>
        {overdue.length > 0 && (
          <Badge className="border-warning/30 bg-warning/15 text-warning">{overdue.length} due</Badge>
        )}
      </div>

      <ul className="space-y-2">
        {visible.map((job) => {
          const due = dueAt(job);
          const isOverdue = due !== null && due.getTime() <= Date.now();
          const enabled = job.follow_up_enabled !== false;
          return (
            <li
              key={job.id}
              className={cn(
                "rounded-lg border border-border/70 p-3 transition-colors",
                isOverdue && "border-warning/40 bg-warning/5",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{job.title}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {job.company || "Unknown company"} · {job.status}
                  </p>
                </div>
                <Switch
                  checked={enabled}
                  aria-label={`Follow-up reminders for ${job.title}`}
                  onCheckedChange={(checked) =>
                    patch.mutate({ id: job.id, values: { follow_up_enabled: checked } })
                  }
                />
              </div>

              {enabled && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 text-xs",
                      isOverdue ? "text-warning" : "text-muted-foreground",
                    )}
                  >
                    <Clock className="h-3 w-3" aria-hidden />
                    {due
                      ? isOverdue
                        ? "Due now"
                        : `Due ${formatDistanceToNow(due, { addSuffix: true })}`
                      : "No date yet"}
                  </span>

                  <Select
                    value={String(job.follow_up_days || 5)}
                    onValueChange={(v) =>
                      patch.mutate({ id: job.id, values: { follow_up_days: Number(v) } })
                    }
                  >
                    <SelectTrigger
                      className="h-7 w-[120px] text-xs"
                      aria-label={`Reminder cadence for ${job.title}`}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CADENCE_OPTIONS.map((d) => (
                        <SelectItem key={d} value={String(d)} className="text-xs">
                          Every {d} days
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    disabled={patch.isPending}
                    onClick={() =>
                      patch.mutate({
                        id: job.id,
                        values: { last_touch_at: new Date().toISOString() },
                      })
                    }
                  >
                    {patch.isPending ? (
                      <Loader2 className="mr-1 h-3 w-3 animate-spin" aria-hidden />
                    ) : (
                      <Check className="mr-1 h-3 w-3" aria-hidden />
                    )}
                    Logged a touch
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {jobs.length > 3 && (
        <Button
          variant="ghost"
          size="sm"
          className="w-full text-xs"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "Show less" : `Show ${jobs.length - 3} more`}
        </Button>
      )}
    </section>
  );
}

export default FollowUpReminders;
