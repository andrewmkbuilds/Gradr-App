import { useState, useEffect } from "react";
import { invokeFunction } from "@/lib/invokeFunction";
import { Link } from "@/lib/router-compat";
import { logPreferencesRead } from "@/lib/preferencesAudit";
import {
  Target, TrendingUp, MapPin, DollarSign, Loader2, Search, BookOpen,
  ExternalLink, BadgeCheck, Info, Bookmark,
} from "lucide-react";

import { ScoreRing } from "@/components/ScoreRing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { CompanyLogo } from "@/components/CompanyLogo";

interface MatchBreakdown {
  score: number;
  skillOverlapPct: number;
  keywordOverlapPct: number;
  titleAlignmentPct: number;
  matchedSkills: string[];
  missingSkills: string[];
  missingKeywords: string[];
}

interface RealJobMatch {
  external_id: string;
  source: string;
  title: string;
  company: string | null;
  location: string | null;
  remote: boolean;
  url: string;
  salary_min: number | null;
  salary_max: number | null;
  posted_at: string | null;
  description: string;
  match: MatchBreakdown;
}

const money = (n: number) => `$${Math.round(n / 1000)}k`;

function salaryLabel(job: RealJobMatch) {
  if (job.salary_min && job.salary_max) return `${money(job.salary_min)} – ${money(job.salary_max)}`;
  if (job.salary_min) return `From ${money(job.salary_min)}`;
  if (job.salary_max) return `Up to ${money(job.salary_max)}`;
  return "Not listed";
}

export default function JobMatchingEngine() {
  const { user } = useAuth();
  const [matches, setMatches] = useState<RealJobMatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [targetRole, setTargetRole] = useState("");
  const [location, setLocation] = useState("");
  const [remoteOnly, setRemoteOnly] = useState(false);
  const [hasResume, setHasResume] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("resumes")
      .select("id")
      .eq("user_id", user.id)
      .limit(1)
      .then(({ data }) => setHasResume((data?.length ?? 0) > 0));
  }, [user]);

  const findMatches = async () => {
    if (!user) {
      toast.error("Please sign in first");
      return;
    }
    setLoading(true);
    try {
      const [{ data: resumes }, { data: profile }, { data: prefs }] = await Promise.all([
        supabase.from("resumes").select("parsed_text").eq("user_id", user.id)
          .order("created_at", { ascending: false }).limit(1),
        supabase.from("profiles").select("target_job_title").eq("user_id", user.id).maybeSingle(),
        supabase.from("user_preferences").select("country, locations").eq("user_id", user.id).maybeSingle(),
      ]);

      void logPreferencesRead("job_matching", Boolean(prefs));


      const resumeText = resumes?.[0]?.parsed_text || "";
      if (!resumeText) {
        toast.error("Upload a resume in Resume Intelligence first — matching is scored against your resume text.");
        return;
      }

      const { data, error } = await invokeFunction("match-jobs", {
        body: {
          resumeText,
          targetRole: targetRole || profile?.target_job_title || "",
          location: location || prefs?.locations?.[0] || "",
          country: prefs?.country || "us",
          remoteOnly,
        },
      });

      if (error || data?.error) throw new Error(data?.error || error?.message || "Match failed");

      setMatches(data.matches ?? []);
      setSearched(true);
      toast.success(`Scored ${data.total_scanned ?? 0} live jobs against your resume.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to find matches");
    } finally {
      setLoading(false);
    }
  };

  const trackJob = async (job: RealJobMatch) => {
    if (!user) return;
    setSaving(job.external_id);
    try {
      const { error } = await supabase.from("tracked_jobs").insert({
        user_id: user.id,
        external_id: job.external_id,
        source: job.source,
        title: job.title,
        company: job.company,
        location: job.location,
        remote: job.remote,
        url: job.url,
        salary_min: job.salary_min,
        salary_max: job.salary_max,
        description: job.description,
        status: "saved",
        match_score: job.match.score,
        posted_at: job.posted_at,
      });
      if (error) throw error;
      toast.success("Saved to your pipeline");
    } catch {
      toast.error("Couldn't save this job");
    } finally {
      setSaving(null);
    }
  };

  const avgScore = matches.length
    ? Math.round(matches.reduce((a, m) => a + m.match.score, 0) / matches.length)
    : 0;
  const strong = matches.filter((m) => m.match.score >= 70).length;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Job Matching</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Live jobs scored against your actual resume text — no generated listings.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary/60 px-2.5 py-1 text-[11px] text-muted-foreground">
              <BadgeCheck className="h-3.5 w-3.5 text-success" />
              Real listings from Adzuna
            </span>
            <Link
              to="/blog/ai-resume-optimization?utm_source=app&utm_medium=internal_link&utm_campaign=ai_resume_optimization&utm_content=match_engine_header"
              className="accent-link inline-flex items-center gap-2 text-xs"
            >
              <BookOpen className="h-3.5 w-3.5" />
              Guide: boost your ATS match score
            </Link>
          </div>
        </div>

        {/* Search */}
        <div className="glass-card p-5 animate-slide-up space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Target role (e.g., Senior Frontend Engineer)"
                value={targetRole}
                onChange={(e) => setTargetRole(e.target.value)}
                className="pl-10 bg-secondary border-border"
              />
            </div>
            <div className="relative flex-1 sm:max-w-[220px]">
              <MapPin className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="pl-10 bg-secondary border-border"
              />
            </div>
            <Button
              onClick={findMatches}
              disabled={loading}
              className="bg-primary text-primary-foreground min-h-11 sm:min-w-[140px]"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Find matches"}
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="remote-only" aria-label="Remote only" checked={remoteOnly} onCheckedChange={setRemoteOnly} />
            <Label htmlFor="remote-only" className="text-xs text-muted-foreground">Remote only</Label>
          </div>
          {!hasResume && (
            <p className="text-xs text-warning">
              Upload a resume in Resume Intelligence first — match scores are computed from your resume text.
            </p>
          )}
        </div>

        {matches.length > 0 && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="glass-card p-5">
                <div className="flex items-center gap-2 mb-2">
                  <Target className="h-4 w-4 text-primary" />
                  <span className="text-xs text-muted-foreground">Live matches</span>
                </div>
                <p className="stat-value text-foreground">{matches.length}</p>
              </div>
              <div className="glass-card p-5">
                <div className="flex items-center gap-2 mb-2">
                  <BadgeCheck className="h-4 w-4 text-success" />
                  <span className="text-xs text-muted-foreground">Strong fit (70+)</span>
                </div>
                <p className="stat-value text-foreground">{strong}</p>
              </div>
              <div className="glass-card p-5">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="accent-text h-4 w-4" />
                  <span className="text-xs text-muted-foreground">Avg match score</span>
                </div>
                <p className="stat-value text-foreground">{avgScore}%</p>
              </div>
            </div>

            <p className="flex items-start gap-2 text-xs text-muted-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Match score is a calculated metric: 50% skill overlap, 30% title alignment, 20% keyword overlap
              between your resume and the job's real description.
            </p>

            <div className="space-y-3">
              {matches.map((job) => {
                const open = expanded === job.external_id;
                return (
                  <div key={job.external_id} className="glass-card p-5 transition-all hover:glow-border">
                    <button
                      type="button"
                      onClick={() => setExpanded(open ? null : job.external_id)}
                      aria-expanded={open}
                      className="w-full text-left"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-4">
                        <div className="flex min-w-0 items-center gap-4">
                          <ScoreRing score={job.match.score} size={56} />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <CompanyLogo company={job.company} size={20} />
                              <h3 className="truncate text-sm font-semibold text-foreground">{job.title}</h3>
                            </div>
                            <p className="text-xs text-muted-foreground">{job.company ?? "Company not listed"}</p>
                            <div className="mt-1.5 flex flex-wrap items-center gap-3">
                              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                <MapPin className="h-3 w-3" /> {job.location ?? "—"}
                              </span>
                              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                <DollarSign className="h-3 w-3" /> {salaryLabel(job)}
                              </span>
                              {job.remote && (
                                <span className="rounded-full bg-success/10 px-2 py-0.5 text-[10px] text-success">Remote</span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {job.match.matchedSkills.slice(0, 3).map((s) => (
                            <span key={s} className="accent-chip px-2 py-0.5 text-xs font-medium">{s}</span>
                          ))}
                        </div>
                      </div>
                    </button>

                    {open && (
                      <div className="mt-4 space-y-4 border-t border-border pt-4">
                        <div className="grid grid-cols-3 gap-3">
                          {[
                            ["Skill overlap", job.match.skillOverlapPct],
                            ["Title alignment", job.match.titleAlignmentPct],
                            ["Keyword overlap", job.match.keywordOverlapPct],
                          ].map(([label, value]) => (
                            <div key={label as string} className="rounded-lg bg-secondary/50 p-3">
                              <p className="text-[11px] text-muted-foreground">{label}</p>
                              <p className="text-sm font-semibold text-foreground">{value}%</p>
                            </div>
                          ))}
                        </div>

                        {job.match.missingSkills.length > 0 && (
                          <div>
                            <p className="mb-1 text-xs font-medium text-muted-foreground">
                              Skills in this description that aren't in your resume
                            </p>
                            <div className="flex flex-wrap gap-1">
                              {job.match.missingSkills.map((s) => (
                                <span key={s} className="rounded-full bg-warning/10 px-2 py-0.5 text-xs text-warning">{s}</span>
                              ))}
                            </div>
                          </div>
                        )}

                        {job.match.missingKeywords.length > 0 && (
                          <div>
                            <p className="mb-1 text-xs font-medium text-muted-foreground">Missing keywords</p>
                            <div className="flex flex-wrap gap-1">
                              {job.match.missingKeywords.slice(0, 15).map((k) => (
                                <span key={k} className="rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">{k}</span>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="flex flex-wrap gap-2">
                          <Button asChild size="sm" className="min-h-10">
                            <a href={job.url} target="_blank" rel="noopener noreferrer">
                              View original listing <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
                            </a>
                          </Button>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="sm"
                                variant="outline"
                                className="min-h-10"
                                disabled={saving === job.external_id}
                                onClick={() => trackJob(job)}
                              >
                                {saving === job.external_id
                                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  : <><Bookmark className="mr-1.5 h-3.5 w-3.5" /> Save to pipeline</>}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Track this job in your application pipeline</TooltipContent>
                          </Tooltip>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {!loading && matches.length === 0 && (
          <div className="glass-card flex flex-col items-center justify-center p-12 animate-slide-up">
            <Target className="mb-4 h-12 w-12 text-muted-foreground" />
            <h3 className="mb-1 text-lg font-semibold text-foreground">
              {searched ? "No live jobs cleared the bar" : "Match against real openings"}
            </h3>
            <p className="max-w-md text-center text-sm text-muted-foreground">
              {searched
                ? "Try a broader role title, a different location, or turn off remote-only."
                : "Enter a target role and we'll pull live listings and score each one against your resume."}
            </p>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
