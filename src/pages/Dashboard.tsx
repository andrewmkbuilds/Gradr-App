import {
  FileText, Target, Zap, Mic, TrendingUp, Briefcase, Bookmark, Send, CalendarCheck, Trophy,
  XCircle, Bell, AlertCircle, RefreshCw, Sparkles,
} from "lucide-react";
import { StatCard } from "@/components/StatCard";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "@/lib/router-compat";
import { formatDistanceToNow } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { CreditsBalance } from "@/components/CreditsBalance";
import { PaymentIssueBanner } from "@/components/PaymentIssueBanner";
import { UsageBars } from "@/components/UsageBars";
import { DashboardSkeleton } from "@/components/skeletons/RouteSkeletons";
import { DailyBriefing } from "@/components/dashboard/DailyBriefing";
import { GettingStarted } from "@/components/dashboard/GettingStarted";
import { TargetingCard } from "@/components/dashboard/TargetingCard";
import { NextThreeDays } from "@/components/dashboard/NextThreeDays";
import { WhyThisScore } from "@/components/dashboard/WhyThisScore";
import { buildBriefing, setupSteps, type BriefingInput } from "@/lib/careerBriefing";
import { Button } from "@/components/ui/button";
import { MotionReveal } from "@/components/motion";
import { MomentumCard } from "@/components/dashboard/MomentumCard";
import { UpgradeNudge } from "@/components/UpgradeNudge";

interface StageCount {
  saved: number; applied: number; interview: number; offer: number; rejected: number;
}

interface ReminderRow {
  id: string;
  title: string;
  due_at: string;
  done: boolean;
  tracked_jobs?: { title: string; company: string | null } | null;
}

const STAGE_META: { key: keyof StageCount; label: string; icon: typeof Bookmark; color: string }[] = [
  { key: "saved", label: "Saved", icon: Bookmark, color: "text-muted-foreground" },
  { key: "applied", label: "Applied", icon: Send, color: "text-primary" },
  { key: "interview", label: "Interview", icon: CalendarCheck, color: "text-warning" },
  { key: "offer", label: "Offer", icon: Trophy, color: "text-success" },
  { key: "rejected", label: "Rejected", icon: XCircle, color: "text-destructive" },
];

const QUICK_ACTIONS = [
  { icon: FileText, label: "Resume", desc: "Score & optimise", path: "/resume" },
  { icon: Target, label: "Jobs", desc: "Matched roles", path: "/jobs" },
  { icon: Zap, label: "Apply", desc: "Tailored packs", path: "/apply" },
  { icon: Mic, label: "Interview", desc: "AI mock round", path: "/interview" },
];

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["dashboard", user?.id],
    enabled: !!user,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    queryFn: loadDashboard,
  });

  async function loadDashboard() {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const now = new Date();

    const [resumeRes, matchRes, trackedRes, remindersRes, interviewRes] = await Promise.all([
      supabase
        .from("resumes")
        .select("ats_score, keyword_match, formatting_score, impact_score")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(1),
      supabase
        .from("job_matches")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(10),
      supabase.from("tracked_jobs").select("status, applied_at").eq("user_id", user!.id),
      supabase
        .from("job_reminders")
        .select("id, title, due_at, done, tracked_jobs(title, company)")
        .eq("user_id", user!.id)
        .eq("done", false)
        .order("due_at", { ascending: true })
        .limit(20),
      supabase
        .from("interview_sessions")
        .select("id, created_at")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    const resume = resumeRes.data?.[0];
    const matches = matchRes.data || [];
    const tracked = trackedRes.data || [];
    const sessions = interviewRes.data || [];
    const highConf = matches.filter((m) => (m.match_score ?? 0) >= 85).length;

    const stages: StageCount = { saved: 0, applied: 0, interview: 0, offer: 0, rejected: 0 };
    let appliedThisWeek = 0;
    tracked.forEach((t) => {
      const k = (t.status || "saved") as keyof StageCount;
      if (k in stages) stages[k]++;
      if (t.applied_at && new Date(t.applied_at) >= weekAgo) appliedThisWeek++;
    });

    const allReminders = (remindersRes.data || []) as ReminderRow[];
    const overdueCount = allReminders.filter((r) => new Date(r.due_at) < now).length;

    const input: BriefingInput = {
      resumeScore: resume?.ats_score ?? 0,
      keywordMatch: resume?.keyword_match ?? 0,
      formattingScore: resume?.formatting_score ?? 0,
      impactScore: resume?.impact_score ?? 0,
      totalResumes: resumeRes.data?.length ?? 0,
      totalMatches: matches.length,
      highConfidence: highConf,
      appliedThisWeek,
      stages,
      overdueCount,
      nextReminderTitle: allReminders[0]?.title ?? null,
      interviewSessions: sessions.length,
      lastInterviewAt: sessions[0]?.created_at ?? null,
    };

    return {
      input,
      stages,
      reminders: allReminders.slice(0, 5),
      overdueCount,
      jobMatches: matches.slice(0, 4),
      matchRate: matches.length > 0 ? `${Math.round((highConf / matches.length) * 100)}%` : "—",
    };
  }

  if (isLoading || !user) return <DashboardSkeleton />;

  if (isError || !data) {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <AlertCircle className="mx-auto h-8 w-8 text-destructive" aria-hidden />
        <h1 className="mt-4 text-lg font-semibold text-foreground">We couldn't load your dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your data is safe — this is usually a temporary connection issue.
        </p>
        <Button className="mt-5" onClick={() => refetch()}>
          <RefreshCw className="mr-2 h-4 w-4" aria-hidden /> Try again
        </Button>
      </div>
    );
  }

  const { input, stages, reminders, overdueCount, jobMatches, matchRate } = data;
  const briefing = buildBriefing(input);
  const steps = setupSteps(input);
  const totalTracked = stages.saved + stages.applied + stages.interview + stages.offer + stages.rejected;
  const displayName =
    (user.user_metadata?.["full_name"] as string | undefined)?.split(" ")[0] ??
    user.email?.split("@")[0] ??
    null;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PaymentIssueBanner />

      <UpgradeNudge />

      <DailyBriefing briefing={briefing} name={displayName} />

      <WhyThisScore briefing={briefing} />

      <TargetingCard />

      <GettingStarted steps={steps} />

      <NextThreeDays />

      <FollowUpReminders />

      <MomentumCard />


      <MotionReveal onView className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={FileText}
          title="Resume score"
          value={input.resumeScore > 0 ? String(input.resumeScore) : "—"}
          subtitle={input.resumeScore > 0 ? "Latest ATS score" : "Upload a resume"}
          glowing={input.resumeScore > 0}
        />
        <StatCard icon={Send} title="Applied this week" value={String(input.appliedThisWeek)} subtitle={`${stages.applied} total in pipeline`} />
        <StatCard icon={Briefcase} title="Pipeline" value={String(totalTracked)} subtitle={`${stages.interview} at interview`} />
        <StatCard icon={TrendingUp} title="Match rate" value={matchRate} subtitle="Strong matches (85%+)" />
      </MotionReveal>

      {/* Pipeline stage breakdown */}
      <section aria-labelledby="pipeline-heading" className="glass-card p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 id="pipeline-heading" className="text-sm font-semibold text-foreground">Pipeline by stage</h2>
          <button onClick={() => navigate("/pipeline")} className="accent-link text-xs">
            View pipeline →
          </button>
        </div>
        {totalTracked === 0 ? (
          <EmptyState
            title="Nothing tracked yet"
            body="Save a role from your matches and Gradr will track stages, follow-ups and outcomes automatically."
            cta="Find roles"
            onClick={() => navigate("/jobs")}
          />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {STAGE_META.map((stage) => (
              <button
                key={stage.key}
                onClick={() => navigate("/pipeline")}
                className="flex flex-col items-start rounded-lg bg-secondary/50 p-4 text-left transition-colors hover:bg-secondary"
              >
                <stage.icon className={`mb-2 h-4 w-4 ${stage.color}`} aria-hidden />
                <span className="font-display text-2xl font-bold text-foreground">{stages[stage.key]}</span>
                <span className="mt-0.5 text-xs text-muted-foreground">{stage.label}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Reminders */}
        <section aria-labelledby="reminders-heading" className="glass-card p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 id="reminders-heading" className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Bell className="accent-text h-4 w-4" aria-hidden />
              Follow-ups
              {overdueCount > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs text-destructive">
                  <AlertCircle className="h-3 w-3" aria-hidden /> {overdueCount} overdue
                </span>
              )}
            </h2>
            <button onClick={() => navigate("/pipeline")} className="accent-link text-xs">
              Manage →
            </button>
          </div>
          {reminders.length === 0 ? (
            <EmptyState
              title="No follow-ups scheduled"
              body="Most replies come from the second touch. Add a reminder when you apply."
              cta="Open pipeline"
              onClick={() => navigate("/pipeline")}
            />
          ) : (
            <ul className="space-y-2">
              {reminders.map((r) => {
                const overdue = new Date(r.due_at) < new Date();
                return (
                  <li
                    key={r.id}
                    className="flex items-center justify-between rounded-lg bg-secondary/50 p-3 transition-colors hover:bg-secondary"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{r.title}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {r.tracked_jobs?.title || "—"}
                        {r.tracked_jobs?.company ? ` · ${r.tracked_jobs.company}` : ""}
                      </p>
                    </div>
                    <span className={`ml-3 shrink-0 text-xs ${overdue ? "font-medium text-destructive" : "text-muted-foreground"}`}>
                      {formatDistanceToNow(new Date(r.due_at), { addSuffix: true })}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Recent matches */}
        <section aria-labelledby="matches-heading" className="glass-card p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 id="matches-heading" className="text-sm font-semibold text-foreground">Recent job matches</h2>
            <button onClick={() => navigate("/jobs")} className="accent-link text-xs">
              Browse →
            </button>
          </div>
          {jobMatches.length === 0 ? (
            <EmptyState
              title="No matches yet"
              body="Gradr ranks live openings against your resume — not just keywords."
              cta="Find matches"
              onClick={() => navigate("/jobs")}
            />
          ) : (
            <ul className="space-y-2">
              {jobMatches.map((match) => (
                <li
                  key={match.id}
                  className="flex items-center justify-between rounded-lg bg-secondary/50 p-3 transition-colors hover:bg-secondary"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                      <span className="text-xs font-bold text-primary">{(match.company || "?")[0]}</span>
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{match.job_title}</p>
                      <p className="truncate text-xs text-muted-foreground">{match.company || "Unknown"}</p>
                    </div>
                  </div>
                  <span
                    className={`ml-3 shrink-0 rounded-full px-2 py-0.5 text-xs tabular-nums ${
                      (match.match_score ?? 0) >= 85 ? "bg-success/15 text-success" : "bg-secondary text-muted-foreground"
                    }`}
                  >
                    {match.match_score ?? 0}%
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Quick jump */}
      <section aria-labelledby="quick-heading" className="glass-card p-6">
        <h2 id="quick-heading" className="mb-4 text-sm font-semibold text-foreground">Jump back in</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {QUICK_ACTIONS.map((action) => (
            <button
              key={action.label}
              onClick={() => navigate(action.path)}
              className="group flex min-h-11 flex-col items-start rounded-lg bg-secondary/50 p-4 text-left transition-all hover:bg-secondary hover:glow-border"
            >
              <action.icon className="mb-3 h-5 w-5 text-primary" aria-hidden />
              <span className="text-sm font-medium text-foreground">{action.label}</span>
              <span className="mt-0.5 text-xs text-muted-foreground">{action.desc}</span>
            </button>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <CreditsBalance />
        <UsageBars />
      </div>

      {isFetching && <span className="sr-only" role="status">Refreshing dashboard</span>}
    </div>
  );
}

function EmptyState({ title, body, cta, onClick }: { title: string; body: string; cta: string; onClick: () => void }) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed border-border/70 px-6 py-8 text-center">
      <Sparkles className="accent-text h-5 w-5" aria-hidden />
      <p className="mt-3 text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1 max-w-xs text-xs text-muted-foreground">{body}</p>
      <Button size="sm" variant="secondary" className="mt-4" onClick={onClick}>
        {cta}
      </Button>
    </div>
  );
}
