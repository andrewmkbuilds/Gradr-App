import { useEffect, useState } from "react";
import { FileText, Target, Zap, Mic, TrendingUp, Briefcase, Loader2 } from "lucide-react";
import { StatCard } from "@/components/StatCard";
import { ScoreRing } from "@/components/ScoreRing";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";

const statusColors: Record<string, string> = {
  Applied: "text-primary bg-primary/10",
  Interview: "text-success bg-success/10",
  Screening: "text-warning bg-warning/10",
  Rejected: "text-destructive bg-destructive/10",
};

interface DashboardStats {
  resumeScore: number;
  keywordMatch: number;
  formattingScore: number;
  impactScore: number;
  totalMatches: number;
  highConfidence: number;
  totalResumes: number;
  interviewRate: string;
}

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [jobMatches, setJobMatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) loadDashboard();
  }, [user]);

  const loadDashboard = async () => {
    const [resumeRes, matchRes] = await Promise.all([
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
    ]);

    const resume = resumeRes.data?.[0];
    const matches = matchRes.data || [];
    const highConf = matches.filter((m) => (m.match_score ?? 0) >= 85).length;

    setStats({
      resumeScore: resume?.ats_score ?? 0,
      keywordMatch: resume?.keyword_match ?? 0,
      formattingScore: resume?.formatting_score ?? 0,
      impactScore: resume?.impact_score ?? 0,
      totalMatches: matches.length,
      highConfidence: highConf,
      totalResumes: resumeRes.data?.length ?? 0,
      interviewRate: matches.length > 0 ? `${Math.round((highConf / matches.length) * 100)}%` : "—",
    });
    setJobMatches(matches.slice(0, 4));
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const s = stats!;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Career Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">Your AI-powered career command center</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={FileText} title="Resume Score" value={s.resumeScore > 0 ? String(s.resumeScore) : "—"} subtitle={s.resumeScore > 0 ? "Latest ATS score" : "Upload a resume"} glowing={s.resumeScore > 0} />
        <StatCard icon={Target} title="Job Matches" value={String(s.totalMatches)} subtitle={`${s.highConfidence} high-confidence`} />
        <StatCard icon={Briefcase} title="Resumes" value={String(s.totalResumes)} subtitle="Uploaded" />
        <StatCard icon={TrendingUp} title="Match Rate" value={s.interviewRate} subtitle="High-confidence ratio" />
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

        {/* Recent Job Matches */}
        <div className="glass-card p-6 lg:col-span-2 animate-slide-up">
          <h3 className="text-sm font-semibold text-foreground mb-4">Recent Job Matches</h3>
          {jobMatches.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No job matches yet. Use the Job Matching engine to find opportunities.</p>
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
