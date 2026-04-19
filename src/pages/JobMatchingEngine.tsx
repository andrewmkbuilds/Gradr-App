import { useState, useEffect } from "react";
import { Target, TrendingUp, MapPin, DollarSign, Star, Loader2, Search } from "lucide-react";
import { ScoreRing } from "@/components/ScoreRing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { handleAiFunctionError } from "@/lib/aiErrors";

interface JobMatch {
  job_title: string;
  company: string;
  location: string;
  salary_range: string;
  match_score: number;
  matched_skills: string[];
  missing_skills: string[];
  ai_strategy: string;
}

export default function JobMatchingEngine() {
  const { user } = useAuth();
  const [matches, setMatches] = useState<JobMatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [targetRole, setTargetRole] = useState("");
  const [hasResume, setHasResume] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);

  useEffect(() => {
    if (user) checkForResume();
  }, [user]);

  const checkForResume = async () => {
    const { data } = await supabase
      .from("resumes")
      .select("id")
      .eq("user_id", user!.id)
      .limit(1);
    setHasResume((data?.length ?? 0) > 0);
  };

  const findMatches = async () => {
    if (!user) {
      toast.error("Please sign in first");
      return;
    }

    setLoading(true);
    try {
      // Get latest resume
      const { data: resumes } = await supabase
        .from("resumes")
        .select("parsed_text")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1);

      // Get profile
      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", user.id)
        .single();

      const resumeText = resumes?.[0]?.parsed_text || "";
      if (!resumeText) {
        toast.error("Please upload a resume first in the Resume Intelligence page");
        setLoading(false);
        return;
      }

      const { data, error } = await supabase.functions.invoke("match-jobs", {
        body: {
          resumeText,
          targetRole: targetRole || profile?.target_job_title,
          targetIndustry: profile?.target_industry,
          targetSalary: profile?.target_salary,
          skills: profile?.skills,
        },
      });

      if (error || data?.error) {
        if (handleAiFunctionError(error, data)) { setLoading(false); return; }
        throw error ?? new Error(data?.error || "Match failed");
      }

      setMatches(data.matches || []);
      toast.success(`Found ${data.matches?.length || 0} job matches!`);
    } catch (error: any) {
      toast.error(error.message || "Failed to find matches");
    } finally {
      setLoading(false);
    }
  };

  const avgScore = matches.length > 0
    ? Math.round(matches.reduce((a, m) => a + m.match_score, 0) / matches.length)
    : 0;
  const highConf = matches.filter((m) => m.match_score >= 85).length;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Job Matching</h1>
        <p className="text-sm text-muted-foreground mt-1">AI-curated opportunities matched to your profile</p>
      </div>

      {/* Search bar */}
      <div className="glass-card p-5 animate-slide-up">
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Target role (e.g., Senior Frontend Engineer)"
              value={targetRole}
              onChange={(e) => setTargetRole(e.target.value)}
              className="pl-10 bg-secondary border-border"
            />
          </div>
          <Button
            onClick={findMatches}
            disabled={loading}
            className="bg-primary text-primary-foreground"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Find Matches"}
          </Button>
        </div>
        {!hasResume && (
          <p className="text-xs text-warning mt-2">Upload a resume first in the Resume Intelligence page for better matches.</p>
        )}
      </div>

      {matches.length > 0 && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="glass-card p-5 animate-slide-up">
              <div className="flex items-center gap-2 mb-2">
                <Target className="h-4 w-4 text-primary" />
                <span className="text-xs text-muted-foreground">Active Matches</span>
              </div>
              <p className="stat-value text-foreground">{matches.length}</p>
            </div>
            <div className="glass-card p-5 animate-slide-up">
              <div className="flex items-center gap-2 mb-2">
                <Star className="h-4 w-4 text-warning" />
                <span className="text-xs text-muted-foreground">High Confidence</span>
              </div>
              <p className="stat-value text-foreground">{highConf}</p>
            </div>
            <div className="glass-card p-5 animate-slide-up">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="h-4 w-4 text-success" />
                <span className="text-xs text-muted-foreground">Avg Match Score</span>
              </div>
              <p className="stat-value text-foreground">{avgScore}%</p>
            </div>
          </div>

          <div className="space-y-3">
            {matches.map((job, idx) => (
              <div
                key={`${job.company}-${job.job_title}`}
                className="glass-card p-5 hover:glow-border transition-all animate-slide-up cursor-pointer"
                onClick={() => setExpanded(expanded === idx ? null : idx)}
              >
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <div className="flex items-center gap-4 min-w-0">
                    <ScoreRing score={job.match_score} size={56} />
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold text-foreground">{job.job_title}</h3>
                      <p className="text-xs text-muted-foreground">{job.company}</p>
                      <div className="flex items-center gap-3 mt-1.5">
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <MapPin className="h-3 w-3" /> {job.location}
                        </span>
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <DollarSign className="h-3 w-3" /> {job.salary_range}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {job.matched_skills.slice(0, 3).map((s) => (
                      <span key={s} className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
                {expanded === idx && (
                  <div className="mt-4 pt-4 border-t border-border space-y-3">
                    {job.missing_skills.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">Missing Skills:</p>
                        <div className="flex gap-1 flex-wrap">
                          {job.missing_skills.map((s) => (
                            <span key={s} className="text-xs px-2 py-0.5 rounded-full bg-warning/10 text-warning">{s}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">AI Strategy:</p>
                      <p className="text-sm text-foreground/80">{job.ai_strategy}</p>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {!loading && matches.length === 0 && (
        <div className="glass-card p-12 flex flex-col items-center justify-center animate-slide-up">
          <Target className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold text-foreground mb-1">Find Your Perfect Match</h3>
          <p className="text-sm text-muted-foreground text-center max-w-md">
            Enter your target role and click "Find Matches" to get AI-powered job recommendations based on your resume.
          </p>
        </div>
      )}
    </div>
  );
}
