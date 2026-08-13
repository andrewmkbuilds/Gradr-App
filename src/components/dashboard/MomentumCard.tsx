import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Flame, Gift, Copy, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "@/lib/router-compat";

const DAY = 86_400_000;

function dayKey(d: Date) {
  return d.toISOString().slice(0, 10);
}

/** Consecutive active days ending today or yesterday. */
function streakFrom(days: Set<string>) {
  let streak = 0;
  const cursor = new Date();
  if (!days.has(dayKey(cursor))) cursor.setTime(cursor.getTime() - DAY);
  while (days.has(dayKey(cursor))) {
    streak += 1;
    cursor.setTime(cursor.getTime() - DAY);
  }
  return streak;
}

/**
 * Retention surface: activity streak over the last 14 days plus the referral
 * hook. Activity = an application sent or a mock interview run.
 */
export function MomentumCard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const { data } = useQuery({
    queryKey: ["momentum", user?.id],
    enabled: !!user,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const since = new Date(Date.now() - 30 * DAY).toISOString();
      const [apps, sessions] = await Promise.all([
        supabase
          .from("tracked_jobs")
          .select("applied_at")
          .eq("user_id", user!.id)
          .gte("applied_at", since),
        supabase
          .from("interview_sessions")
          .select("created_at")
          .eq("user_id", user!.id)
          .gte("created_at", since),
      ]);
      const days = new Set<string>();
      (apps.data ?? []).forEach((a) => a.applied_at && days.add(dayKey(new Date(a.applied_at))));
      (sessions.data ?? []).forEach((s) => days.add(dayKey(new Date(s.created_at))));
      return Array.from(days);
    },
  });

  const days = useMemo(() => new Set(data ?? []), [data]);
  const streak = streakFrom(days);

  const last14 = useMemo(
    () =>
      Array.from({ length: 14 }, (_, i) => {
        const d = new Date(Date.now() - (13 - i) * DAY);
        return { key: dayKey(d), active: days.has(dayKey(d)) };
      }),
    [days],
  );

  const referralLink =
    typeof window !== "undefined" && user
      ? `${window.location.origin}/?ref=${user.id.slice(0, 8)}&utm_source=referral&utm_medium=app&utm_campaign=momentum`
      : "";

  const copyReferral = async () => {
    try {
      await navigator.clipboard.writeText(referralLink);
      toast.success("Referral link copied — share it anywhere.");
    } catch {
      toast.error("Couldn't copy. Select the link manually from the affiliate page.");
    }
  };

  return (
    <section className="glass-card p-6" aria-labelledby="momentum-heading">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 id="momentum-heading" className="text-sm font-semibold text-foreground">
            Momentum
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            An application sent or a mock interview run counts as an active day.
          </p>
        </div>
        <span className="accent-chip gap-1.5 px-3 py-1 text-sm">
          <Flame className="h-4 w-4" aria-hidden />
          {streak} day{streak === 1 ? "" : "s"}
        </span>
      </div>

      <div className="mt-4 flex items-end gap-1.5" role="img" aria-label={`${streak} day active streak`}>
        {last14.map((d) => (
          <div
            key={d.key}
            title={d.key}
            className={`h-8 flex-1 rounded-md transition-colors ${
              d.active ? "bg-primary/80" : "bg-secondary/60"
            }`}
          />
        ))}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {streak === 0
          ? "Restart the streak today — one tailored application is enough."
          : `Keep it alive: ${days.size} active day${days.size === 1 ? "" : "s"} in the last 30.`}
      </p>

      <div className="accent-card mt-5 flex flex-col gap-3 rounded-lg p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-xs font-semibold text-foreground">
            <Gift className="accent-text h-3.5 w-3.5" aria-hidden /> Refer a friend
          </p>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            They get Gradr, you earn commission on every plan they buy.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button size="sm" variant="outline" className="gap-1.5" onClick={copyReferral}>
            <Copy className="h-3.5 w-3.5" aria-hidden /> Copy link
          </Button>
          <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => navigate("/affiliate")}>
            Details <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Button>
        </div>
      </div>
    </section>
  );
}
