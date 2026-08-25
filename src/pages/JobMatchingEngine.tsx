import { useState, useEffect } from "react";
import { trackJobSaved } from "@/lib/telemetry/activation";
import { track } from "@/lib/telemetry/events";
import { Link } from "react-router-dom";
import { logPreferencesRead } from "@/lib/preferencesAudit";
import {
  Target, TrendingUp, MapPin, DollarSign, Loader2, Search, BookOpen,
  ExternalLink, BadgeCheck, Info, Bookmark,
} from "lucide-react";

import { motion, AnimatePresence } from "motion/react";

import { PageHeader } from "@/components/app/PageHeader";
import { EngineCanvas } from "@/components/app/EngineCanvas";
import { Progressive } from "@/components/app/Progressive";
import { JobMatchDemo } from "@/components/demos/EngineDemos";
import { MetricBar } from "@/components/app/MetricBar";
import { StatTile } from "@/components/app/StatTile";
import { SkeletonList } from "@/components/states";
import { Surface } from "@/components/ui/surface";
import { useReducedMotionPref } from "@/hooks/useMotionPreference";
import { duration as motionDuration, easeOut, springSnappy } from "@/lib/motion/tokens";
import { Button } from "@/components/ds/Button";
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

function scoreTone(score: number) {
  if (score >= 80) return { ring: "text-success", bg: "bg-success/10", label: "Strong fit" };
  if (score >= 60) return { ring: "text-primary", bg: "bg-primary/10", label: "Worth a shot" };
  return { ring: "text-warning", bg: "bg-warning/10", label: "Stretch" };
}

export default function JobMatchingEngine() {
  const { user } = useAuth();
  const reduced = useReducedMotionPref();
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
    track("job_search_started", { surface: "job_matching" });
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

      const { data, error } = await supabase.functions.invoke("match-jobs", {
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
      trackJobSaved(user.id, {
        source: job.source,
        match_score: Math.round(job.match.score),
        remote: Boolean(job.remote),
        has_salary: Boolean(job.salary_min || job.salary_max),
      });
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
      <EngineCanvas>
        <PageHeader
          eyebrow="Job Matching"
          icon={<Target className="h-3.5 w-3.5" aria-hidden="true" />}
          title="Score live openings against your real resume"
          description="Every listing is a live posting from Adzuna, scored on skill overlap, title alignment and keyword coverage — nothing is generated."
          meta={
            <>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-secondary px-2.5 py-1 text-[11px] text-muted-foreground">
                <BadgeCheck className="h-3.5 w-3.5 text-success" aria-hidden="true" />
                Real listings from Adzuna
              </span>
              <Link
                to="/blog/ai-resume-optimization?utm_source=app&utm_medium=internal_link&utm_campaign=ai_resume_optimization&utm_content=match_engine_header"
                className="story-link inline-flex items-center gap-1.5 text-xs text-primary"
              >
                <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
                Guide: boost your ATS match score
              </Link>
            </>
          }
        />

        {/* Search console */}
        <motion.div
          initial={reduced ? { opacity: 0 } : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={reduced ? { duration: 0.14 } : { duration: motionDuration.base, ease: easeOut }}
        >
          <Surface level={3} className="space-y-4 p-5">
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="group relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground transition-colors group-focus-within:text-primary" aria-hidden="true" />
                <Input
                  aria-label="Target role"
                  placeholder="Target role (e.g., Senior Frontend Engineer)"
                  value={targetRole}
                  onChange={(e) => setTargetRole(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") findMatches(); }}
                  className="min-h-11 bg-surface-secondary pl-10"
                />
              </div>
              <div className="group relative flex-1 sm:max-w-[220px]">
                <MapPin className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground transition-colors group-focus-within:text-primary" aria-hidden="true" />
                <Input
                  aria-label="Location"
                  placeholder="Location"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") findMatches(); }}
                  className="min-h-11 bg-surface-secondary pl-10"
                />
              </div>
              <Button onClick={findMatches} disabled={loading} className="interactive press-scale min-h-11 sm:min-w-[150px]">
                {loading ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> Scoring…</>
                ) : (
                  "Find matches"
                )}
              </Button>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Switch id="remote-only" aria-label="Remote only" checked={remoteOnly} onCheckedChange={setRemoteOnly} />
                <Label htmlFor="remote-only" className="text-xs text-muted-foreground">Remote only</Label>
              </div>
              {!hasResume && (
                <p className="text-xs text-warning">
                  Upload a resume in Resume Intelligence first — scores are computed from your resume text.
                </p>
              )}
            </div>
          </Surface>
        </motion.div>

        <AnimatePresence mode="popLayout">
          {matches.length > 0 && (
            <motion.div
              key="results"
              initial={reduced ? { opacity: 0 } : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="space-y-5"
            >
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <StatTile label="Live matches" value={matches.length} icon={Target} index={0} />
                <StatTile label="Strong fit (70+)" value={strong} icon={BadgeCheck} tone="success" index={1} />
                <StatTile label="Avg match score" value={avgScore} suffix="%" icon={TrendingUp} tone="secondary" index={2} />
              </div>

              <p className="flex items-start gap-2 text-xs text-muted-foreground">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                Match score is a calculated metric: 50% skill overlap, 30% title alignment, 20% keyword overlap between
                your resume and the job's real description.
              </p>

              <div className="space-y-3">
                {matches.map((job, i) => {
                  const open = expanded === job.external_id;
                  const tone = scoreTone(job.match.score);
                  return (
                    <motion.div
                      key={job.external_id}
                      layout={!reduced}
                      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={reduced ? { duration: 0.12 } : { duration: motionDuration.base, ease: easeOut, delay: Math.min(i, 8) * 0.04 }}
                    >
                      <Surface level={open ? 3 : 2} interactive={!open} flush className="overflow-hidden">
                        <button
                          type="button"
                          onClick={() => setExpanded(open ? null : job.external_id)}
                          aria-expanded={open}
                          className="w-full p-5 text-left"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-4">
                            <div className="flex min-w-0 items-center gap-4">
                              <div className={`flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-xl ${tone.bg}`}>
                                <span className={`font-display text-lg leading-none tabular-nums ${tone.ring}`}>
                                  {job.match.score}
                                </span>
                                <span className="text-[9px] uppercase tracking-wider text-muted-foreground">match</span>
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <CompanyLogo company={job.company} size={20} />
                                  <h3 className="truncate text-sm font-semibold text-foreground">{job.title}</h3>
                                  <span className={`hidden rounded-full px-2 py-0.5 text-[10px] sm:inline ${tone.bg} ${tone.ring}`}>
                                    {tone.label}
                                  </span>
                                </div>
                                <p className="text-xs text-muted-foreground">{job.company ?? "Company not listed"}</p>
                                <div className="mt-1.5 flex flex-wrap items-center gap-3">
                                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                    <MapPin className="h-3 w-3" aria-hidden="true" /> {job.location ?? "—"}
                                  </span>
                                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                    <DollarSign className="h-3 w-3" aria-hidden="true" /> {salaryLabel(job)}
                                  </span>
                                  {job.remote && (
                                    <span className="rounded-full bg-success/10 px-2 py-0.5 text-[10px] text-success">Remote</span>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5">
                              {job.match.matchedSkills.slice(0, 3).map((s) => (
                                <span key={s} className="accent-chip">{s}</span>
                              ))}
                            </div>
                          </div>
                        </button>

                        <AnimatePresence initial={false}>
                          {open && (
                            <motion.div
                              initial={reduced ? { opacity: 0 } : { height: 0, opacity: 0 }}
                              animate={reduced ? { opacity: 1 } : { height: "auto", opacity: 1 }}
                              exit={reduced ? { opacity: 0 } : { height: 0, opacity: 0 }}
                              transition={reduced ? { duration: 0.12 } : { duration: motionDuration.fast, ease: easeOut }}
                              className="overflow-hidden"
                            >
                              <div className="space-y-5 border-t border-border px-5 py-5">
                                <div className="grid gap-4 sm:grid-cols-3">
                                  <MetricBar label="Skill overlap" value={job.match.skillOverlapPct} />
                                  <MetricBar label="Title alignment" value={job.match.titleAlignmentPct} delay={0.06} />
                                  <MetricBar label="Keyword overlap" value={job.match.keywordOverlapPct} delay={0.12} />
                                </div>

                                {job.match.missingSkills.length > 0 && (
                                  <div>
                                    <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                                      Skills in this description that aren't in your resume
                                    </p>
                                    <div className="flex flex-wrap gap-1.5">
                                      {job.match.missingSkills.map((s, k) => (
                                        <motion.span
                                          key={s}
                                          initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.88 }}
                                          animate={{ opacity: 1, scale: 1 }}
                                          transition={reduced ? { duration: 0.1 } : { ...springSnappy, delay: k * 0.02 }}
                                          className="rounded-md bg-warning/10 px-2 py-0.5 text-xs text-warning"
                                        >
                                          {s}
                                        </motion.span>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {job.match.missingKeywords.length > 0 && (
                                  <div>
                                    <p className="mb-1.5 text-xs font-medium text-muted-foreground">Missing keywords</p>
                                    <div className="flex flex-wrap gap-1.5">
                                      {job.match.missingKeywords.slice(0, 15).map((k) => (
                                        <span key={k} className="rounded-md bg-surface-secondary px-2 py-0.5 text-xs text-muted-foreground">{k}</span>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                <div className="flex flex-wrap gap-2">
                                  <Button asChild size="sm" className="interactive press-scale min-h-10">
                                    <a href={job.url} target="_blank" rel="noopener noreferrer">
                                      View original listing <ExternalLink className="ml-1.5 h-3.5 w-3.5" aria-hidden="true" />
                                    </a>
                                  </Button>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="interactive press-scale min-h-10"
                                        disabled={saving === job.external_id}
                                        onClick={() => trackJob(job)}
                                      >
                                        {saving === job.external_id
                                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                                          : <><Bookmark className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> Save to pipeline</>}
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Track this job in your application pipeline</TooltipContent>
                                  </Tooltip>
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </Surface>
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {loading && matches.length === 0 && <SkeletonList rows={3} />}

        {!loading && matches.length === 0 && (
          <motion.div
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={reduced ? { duration: 0.14 } : { duration: motionDuration.base, ease: easeOut, delay: 0.08 }}
          >
            <Surface level={3} className="flex flex-col items-center justify-center px-6 py-14 text-center">
              <motion.span
                className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary"
                animate={reduced ? undefined : { y: [0, -6, 0] }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
              >
                <Target className="h-7 w-7" aria-hidden="true" />
              </motion.span>
              <h2 className="font-display text-lg text-foreground">
                {searched ? "No live jobs cleared the bar" : "Match against real openings"}
              </h2>
              <p className="mt-1.5 max-w-md text-sm text-muted-foreground">
                {searched
                  ? "Try a broader role title, a different location, or turn off remote-only."
                  : "Enter a target role and we'll pull live listings and score each one against your resume."}
              </p>
            </Surface>

            {/* Give the ranking behaviour away before the first search. */}
            <Progressive minHeight={340} className="mt-5">
              <JobMatchDemo />
            </Progressive>
          </motion.div>
        )}
      </EngineCanvas>
    </TooltipProvider>
  );
}
