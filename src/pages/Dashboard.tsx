import { FileText, Target, Zap, Mic, TrendingUp, Briefcase, Loader2, Bookmark, Send, CalendarCheck, Trophy, XCircle, Bell, AlertCircle } from "lucide-react";
import { StatCard } from "@/components/StatCard";
import { ScoreRing } from "@/components/ScoreRing";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { useQuery } from "@tanstack/react-query";

interface DashboardStats {
  resumeScore: number;
  keywordMatch: number;
  formattingScore: number;
  impactScore: number;
  totalMatches: number;
  highConfidence: number;
  totalResumes: number;
  interviewRate: string;
  appliedThisWeek: number;
}

interface StageCount {
  saved: number;
  applied: number;
  interview: number;
  offer: number;
  rejected: number;
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

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data, isLoading: loading } = useQuery({
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

    const [resumeRes, matchRes, trackedRes, remindersRes] = await Promise.all([
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
      supabase
        .from("tracked_jobs")
        .select("status, applied_at")
        .eq("user_id", user!.id),
      supabase
        .from("job_reminders")
        .select("id, title, due_at, done, tracked_jobs(title, company)")
        .eq("user_id", user!.id)
        .eq("done", false)
        .order("due_at", { ascending: true })
        .limit(20),
    ]);

    const resume = resumeRes.data?.[0];
    const matches = matchRes.data || [];
    const tracked = trackedRes.data || [];
    const highConf = matches.filter((m) => (m.match_score ?? 0) >= 85).length;

    const stageCounts: StageCount = { saved: 0, applied: 0, interview: 0, offer: 0, rejected: 0 };
    let appliedThisWeek = 0;
    tracked.forEach((t) => {
      const k = (t.status || "saved") as keyof StageCount;
      if (k in stageCounts) stageCounts[k]++;
      if (t.applied_at && new Date(t.applied_at) >= weekAgo) appliedThisWeek++;
    });

    const allReminders = (remindersRes.data || []) as ReminderRow[];
    const overdue = allReminders.filter((r) => new Date(r.due_at) < now).length;

    const stats: DashboardStats = {
      resumeScore: resume?.ats_score ?? 0,
      keywordMatch: resume?.keyword_match ?? 0,
      formattingScore: resume?.formatting_score ?? 0,
      impactScore: resume?.impact_score ?? 0,
      totalMatches: matches.length,
      highConfidence: highConf,
      totalResumes: resumeRes.data?.length ?? 0,
      interviewRate: matches.length > 0 ? `${Math.round((highConf / matches.length) * 100)}%` : "—",
      appliedThisWeek,
    };

    return {
      stats,
      stages: stageCounts,
      reminders: allReminders.slice(0, 5),
      overdueCount: overdue,
      jobMatches: matches.slice(0, 4),
    };
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const stats = data!.stats;
  const stages = data!.stages;
  const reminders = data!.reminders;
  const overdueCount = data!.overdueCount;
  const jobMatches = data!.jobMatches;
  const s = stats;
  const totalTracked = stages.saved + stages.applied + stages.interview + stages.offer + stages.rejected;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Career Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">Your AI-powered career command center</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={FileText} title="Resume Score" value={s.resumeScore > 0 ? String(s.resumeScore) : "—"} subtitle={s.resumeScore > 0 ? "Latest ATS score" : "Upload a resume"} glowing={s.resumeScore > 0} />
        <StatCard icon={Send} title="Applied This Week" value={String(s.appliedThisWeek)} subtitle={`${stages.applied} total in pipeline`} />
        <StatCard icon={Briefcase} title="Pipeline" value={String(totalTracked)} subtitle={`${stages.interview} in interview`} />
        <StatCard icon={TrendingUp} title="Match Rate" value={s.interviewRate} subtitle="High-confidence ratio" />
      </div>

      {/* Pipeline stage breakdown */}
      <div className="glass-card p-6 animate-slide-up">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-foreground">Pipeline by Stage</h3>
          <button onClick={() => navigate("/pipeline")} className="text-xs text-primary hover:underline">
            View pipeline →
          </button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {STAGE_META.map((stage) => (
            <button
              key={stage.key}
              onClick={() => navigate("/pipeline")}
              className="flex flex-col items-start p-4 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors text-left"
            >
              <stage.icon className={`h-4 w-4 ${stage.color} mb-2`} />
              <span className="text-2xl font-bold text-foreground">{stages[stage.key]}</span>
              <span className="text-xs text-muted-foreground mt-0.5">{stage.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Resume Health */}
        <div className="glass-card p-6 animate-slide-up">
          <h3 className="text-sm font-semibold text-foreground mb-4">Resume Health</h3>
          <div className="flex items-center justify-center py-4">
            <ScoreRing score={s.resumeScore} size={140} label="ATS Score" />
          </div>
          <div className="space-y-3 mt-4">
            {[
              { label: "Keyword Match", value: s.keywordMatch },
              { label: "Formatting", value: s.formattingScore },
              { label: "Impact Statements", value: s.impactScore },
            ].map((item) => (
              <div key={item.label}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-muted-foreground">{item.label}</span>
                  <span className="text-foreground">{item.value}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-secondary">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-1000"
                    style={{ width: `${item.value}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Upcoming Reminders */}
        <div className="glass-card p-6 animate-slide-up lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Bell className="h-4 w-4 text-primary" />
              Upcoming Reminders
              {overdueCount > 0 && (
                <span className="inline-flex items-center gap-1 text-xs text-destructive bg-destructive/10 px-2 py-0.5 rounded-full">
                  <AlertCircle className="h-3 w-3" /> {overdueCount} overdue
                </span>
              )}
            </h3>
            <button onClick={() => navigate("/pipeline")} className="text-xs text-primary hover:underline">
              Manage →
            </button>
          </div>
          {reminders.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No upcoming reminders. Add follow-ups from the Pipeline.
            </p>
          ) : (
            <div className="space-y-2">
              {reminders.map((r) => {
                const isOverdue = new Date(r.due_at) < new Date();
                return (
                  <div
                    key={r.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate">{r.title}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {r.tracked_jobs?.title || "—"}
                        {r.tracked_jobs?.company ? ` · ${r.tracked_jobs.company}` : ""}
                      </p>
                    </div>
                    <span className={`text-xs shrink-0 ml-3 ${isOverdue ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                      {formatDistanceToNow(new Date(r.due_at), { addSuffix: true })}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Recent Job Matches */}
      <div className="glass-card p-6 animate-slide-up">
        <h3 className="text-sm font-semibold text-foreground mb-4">Recent Job Matches</h3>
        {jobMatches.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">No job matches yet. Use the Job Feed to find opportunities.</p>
        ) : (
          <div className="space-y-3">
            {jobMatches.map((match) => (
              <div
                key={match.id}
                className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <span className="text-xs font-bold text-primary">{(match.company || "?")[0]}</span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{match.job_title}</p>
                    <p className="text-xs text-muted-foreground">{match.company || "Unknown"}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xs text-muted-foreground">{match.match_score ?? 0}% match</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="glass-card p-6 animate-slide-up">
        <h3 className="text-sm font-semibold text-foreground mb-4">Quick Actions</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { icon: FileText, label: "Optimize Resume", desc: "Improve your ATS score", path: "/resume" },
            { icon: Target, label: "Find Jobs", desc: "AI-matched opportunities", path: "/jobs" },
            { icon: Zap, label: "Quick Apply", desc: "Generate application pack", path: "/apply" },
            { icon: Mic, label: "Mock Interview", desc: "Practice with AI coach", path: "/interview" },
          ].map((action) => (
            <button
              key={action.label}
              onClick={() => navigate(action.path)}
              className="flex flex-col items-start p-4 rounded-lg bg-secondary/50 hover:bg-secondary hover:glow-border transition-all text-left group"
            >
              <action.icon className="h-5 w-5 text-primary mb-3 group-hover:animate-pulse-glow" />
              <span className="text-sm font-medium text-foreground">{action.label}</span>
              <span className="text-xs text-muted-foreground mt-0.5">{action.desc}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
