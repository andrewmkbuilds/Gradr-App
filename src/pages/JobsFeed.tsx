import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { logPreferencesRead } from "@/lib/preferencesAudit";
import { getPaddleEnvironment } from "@/lib/paddle";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Search, Loader2, MapPin, Briefcase, ExternalLink, Bookmark, Sparkles, Link2, AlertCircle, Upload, Building2 } from "lucide-react";
import { toast } from "sonner";
import { handleAiFunctionError } from "@/lib/aiErrors";
import { formatDistanceToNow } from "date-fns";
import { OnboardingDialog } from "@/components/OnboardingDialog";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { CompanyResearchDialog } from "@/components/research/CompanyResearchDialog";
import { CompanyLogo } from "@/components/CompanyLogo";
import { prefetchLogos } from "@/lib/logos";
import { trackJourney } from "@/lib/telemetry/journey";


interface FeedJob {
  external_id: string;
  source: string;
  title: string;
  company: string | null;
  location: string | null;
  remote: boolean;
  url: string;
  salary_min: number | null;
  salary_max: number | null;
  description: string;
  posted_at: string;
  match_score?: number;
  match_reason?: string;
}

const COUNTRIES = [
  { code: "us", label: "United States" },
  { code: "gb", label: "United Kingdom" },
  { code: "ca", label: "Canada" },
  { code: "au", label: "Australia" },
  { code: "de", label: "Germany" },
  { code: "fr", label: "France" },
  { code: "in", label: "India" },
  { code: "nl", label: "Netherlands" },
];

export default function JobsFeed() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [what, setWhat] = useState("");
  const [where, setWhere] = useState("");
  const [country, setCountry] = useState("us");
  const [remoteOnly, setRemoteOnly] = useState(false);
  const [sortBy, setSortBy] = useState<"relevance" | "date" | "salary">("relevance");
  const [companyFilter, setCompanyFilter] = useState("");
  const [jobs, setJobs] = useState<FeedJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [scoring, setScoring] = useState(false);
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [trackedIds, setTrackedIds] = useState<Set<string>>(new Set());
  const [pasteUrl, setPasteUrl] = useState("");
  const [pasting, setPasting] = useState(false);
  const [researchTarget, setResearchTarget] = useState<{ company: string; role?: string } | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [hasResume, setHasResume] = useState<boolean | null>(null);
  const [noResumeScoringAttempted, setNoResumeScoringAttempted] = useState(false);

  useEffect(() => {
    if (user) {
      void initialize();
      void loadTracked();
      void checkResume();
    }
  }, [user]);

  const checkResume = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("resumes")
      .select("id,parsed_text")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1);
    setHasResume(!!data?.[0]?.parsed_text);
  };

  useEffect(() => {
    if (!user || !noResumeScoringAttempted || jobs.length === 0) return;
    const id = window.setInterval(async () => {
      const { data } = await supabase
        .from("resumes")
        .select("id,parsed_text")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1);
      if (data?.[0]?.parsed_text) {
        window.clearInterval(id);
        setHasResume(true);
        toast.success("Resume detected — re-running AI match scoring");
        void scoreJobs(jobs);
      }
    }, 5000);
    return () => window.clearInterval(id);
  }, [user, noResumeScoringAttempted, jobs]);

  const initialize = async () => {
    if (!user) return;
    const { data } = await supabase.from("user_preferences").select("*").eq("user_id", user.id).maybeSingle();
    void logPreferencesRead("jobs_feed", Boolean(data));
    if (!data || !data.onboarded) {
      setShowOnboarding(true);
      return;
    }
    setWhat(data.target_role || "");
    setWhere(data.locations?.[0] || "");
    setCountry(data.country || "us");
    if (data.remote_preference === "remote") setRemoteOnly(true);
  };

  const queryClient = useQueryClient();

  const handleOnboardingComplete = (prefs: { what: string; where: string; country: string; remoteOnly: boolean; salaryMin: number | null }) => {
    setShowOnboarding(false);
    void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    setWhat(prefs.what);
    setWhere(prefs.where);
    setCountry(prefs.country);
    setRemoteOnly(prefs.remoteOnly);
    // Auto-run search with the chosen prefs
    setTimeout(() => runSearch(prefs.what, prefs.where, prefs.country, prefs.remoteOnly), 100);
  };

  const loadTracked = async () => {
    if (!user) return;
    const { data } = await supabase.from("tracked_jobs").select("external_id").eq("user_id", user.id);
    if (data) setTrackedIds(new Set(data.map((d) => d.external_id).filter(Boolean) as string[]));
  };

  const savePrefs = async (overrides?: { what?: string; where?: string; country?: string; remoteOnly?: boolean }) => {
    if (!user) return;
    await supabase.from("user_preferences").upsert(
      {
        user_id: user.id,
        target_role: overrides?.what ?? what,
        locations: (overrides?.where ?? where) ? [overrides?.where ?? where] : [],
        country: overrides?.country ?? country,
        remote_preference: (overrides?.remoteOnly ?? remoteOnly) ? "remote" : "any",
      },
      { onConflict: "user_id" },
    );
  };

  const runSearch = async (q: string, loc: string, ctry: string, remote: boolean) => {
    if (!user) return;
    setLoading(true);
    setJobs([]);
    try {
      const { data, error } = await supabase.functions.invoke("search-jobs", {
        body: { what: q, where: loc, country: ctry, remoteOnly: remote, sortBy },
      });
      if (error || data?.error) {
        if (!handleAiFunctionError(error, data)) toast.error(data?.error || "Search failed");
        return;
      }
      setJobs(data.jobs || []);
      prefetchLogos((data.jobs || []).map((j: FeedJob) => j.company));
      trackJourney("job_match_started", { results: (data.jobs || []).length, remote_only: remote });
      void savePrefs({ what: q, where: loc, country: ctry, remoteOnly: remote });
      void scoreJobs(data.jobs || []);

    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Search failed");
    } finally {
      setLoading(false);
    }
  };

  const search = () => runSearch(what, where, country, remoteOnly);

  const scoreJobs = async (list: FeedJob[]) => {
    if (!user || list.length === 0) return;
    // Hard guard: if we already know there's no resume, don't even hit the resumes table or scoring API
    if (hasResume === false) {
      setNoResumeScoringAttempted(true);
      return;
    }
    const { data: resumeRows } = await supabase
      .from("resumes")
      .select("parsed_text")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1);
    const resumeText = resumeRows?.[0]?.parsed_text;
    if (!resumeText) {
      setHasResume(false);
      setNoResumeScoringAttempted(true);
      return;
    }

    setHasResume(true);
    setNoResumeScoringAttempted(false);
    setScoring(true);
    try {
      const { data, error } = await supabase.functions.invoke("recommend-jobs", {
        body: { jobs: list, resumeText },
      });
      if (error || data?.error) return;
      const scores: { i: number; score: number; reason: string }[] = data?.scores || [];
      trackJourney("job_match_completed", {
        scored: scores.length,
        top_score: scores.length ? Math.max(...scores.map((s) => s.score)) : 0,
      });

      setJobs((prev) => {
        const next = [...prev];
        scores.forEach((s) => {
          if (next[s.i]) next[s.i] = { ...next[s.i], match_score: s.score, match_reason: s.reason };
        });
        return next;
      });
    } finally {
      setScoring(false);
    }
  };

  const trackJob = async (job: FeedJob, status: "saved" | "applied") => {
    if (!user) return;
    setSavingIds((s) => new Set(s).add(job.external_id));
    try {
      const { data: inserted, error } = await supabase
        .from("tracked_jobs")
        .upsert(
          {
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
            posted_at: job.posted_at,
            status,
            applied_at: status === "applied" ? new Date().toISOString() : null,
            match_score: job.match_score ?? null,
          },
          { onConflict: "user_id,source,external_id" },
        )
        .select("id")
        .single();
      if (error) throw error;
      setTrackedIds((s) => new Set(s).add(job.external_id));
      toast.success(status === "applied" ? "Marked as applied" : "Saved to pipeline");

      if (status === "applied" && inserted) {
        trackJourney("application_created", {
          source: job.source,
          has_match_score: typeof job.match_score === "number",
          match_score: job.match_score ?? undefined,
        });
        void generateApplicationPack(inserted.id, job);
      }

    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSavingIds((s) => {
        const next = new Set(s);
        next.delete(job.external_id);
        return next;
      });
    }
  };

  const generateApplicationPack = async (trackedId: string, job: FeedJob) => {
    if (!user) return;
    const { data: resumeRows } = await supabase
      .from("resumes")
      .select("parsed_text")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1);
    const resumeText = resumeRows?.[0]?.parsed_text;
    if (!resumeText) {
      toast.message("Upload a resume to auto-generate cover letters", {
        description: "Visit Resume Engine to upload one.",
      });
      return;
    }

    const tId = toast.loading("Generating tailored cover letter & bullets…");
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("user_id", user.id)
        .maybeSingle();

      const { data, error } = await supabase.functions.invoke("generate-application", {
        body: {
          environment: getPaddleEnvironment(),
          type: "application_pack",
          resumeText,
          jobTitle: job.title,
          company: job.company,
          jobDescription: job.description,
          userName: profile?.display_name || user.email,
        },
      });
      if (error || data?.error) {
        toast.dismiss(tId);
        if (!handleAiFunctionError(error, data)) toast.error(data?.error || "Pack generation failed");
        return;
      }
      await supabase
        .from("tracked_jobs")
        .update({ application_pack: data })
        .eq("id", trackedId);
      toast.dismiss(tId);
      toast.success("Application pack ready — see it in Pipeline");
    } catch (e) {
      toast.dismiss(tId);
      toast.error(e instanceof Error ? e.message : "Pack generation failed");
    }
  };

  const addFromUrl = async () => {
    if (!user || !pasteUrl.trim()) return;
    setPasting(true);
    let host = "unknown";
    try {
      host = new URL(pasteUrl.trim()).hostname.replace(/^www\./, "");
    } catch {
      /* ignore */
    }
    trackJourney("job_url_import_started", { host });
    try {
      const { data, error } = await supabase.functions.invoke("parse-job-url", {
        body: { url: pasteUrl.trim() },
      });
      if (error || data?.error) {
        trackJourney("job_url_import_failed", { host, reason: "parse_failed" });
        if (!handleAiFunctionError(error, data)) toast.error(data?.error || "Failed to parse URL");
        return;
      }

      const { error: insErr } = await supabase.from("tracked_jobs").insert({
        user_id: user.id,
        source: "manual",
        title: data.title || "Untitled",
        company: data.company,
        location: data.location,
        remote: !!data.remote,
        url: pasteUrl.trim(),
        description: data.description,
        salary_min: data.salary_min,
        salary_max: data.salary_max,
        details: {
          employment_type: data.employment_type ?? null,
          salary_currency: data.salary_currency ?? null,
          responsibilities: data.responsibilities ?? [],
          requirements: data.requirements ?? [],
          skills: data.skills ?? [],
          benefits: data.benefits ?? [],
          extraction_source: data.extractionSource ?? null,
        },
        status: "saved",
      });
      if (insErr) throw insErr;
      setPasteUrl("");
      const missing: string[] = Array.isArray(data.missingFields) ? data.missingFields : [];
      const notable = missing.filter((f) => ["company", "salary_min", "description", "requirements"].includes(f));
      trackJourney("job_url_import_completed", {
        host,
        missing_fields: missing.length,
        extraction_source: data.extractionSource ?? "unknown",
      });
      toast.success("Job added to pipeline", {
        description: notable.length
          ? `Some details weren't on the page (${notable.join(", ").replace(/_/g, " ")}). Add them in Pipeline.`
          : undefined,
      });
    } catch (e) {
      trackJourney("job_url_import_failed", { host, reason: "insert_failed" });
      toast.error(e instanceof Error ? e.message : "Failed");

    } finally {
      setPasting(false);
    }
  };

  const filtered = jobs.filter((j) =>
    !companyFilter || (j.company || "").toLowerCase().includes(companyFilter.toLowerCase()),
  );

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <OnboardingDialog open={showOnboarding} onComplete={handleOnboardingComplete} />

      <div>
        <h1 className="text-2xl font-bold tracking-tight">Job Feed</h1>
        <p className="text-sm text-muted-foreground mt-1">Search live job listings powered by Adzuna with AI match scoring.</p>
      </div>

      <Card className="p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          <div className="md:col-span-4 relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Job title or keywords" value={what} onChange={(e) => setWhat(e.target.value)} className="pl-10 h-11" onKeyDown={(e) => e.key === "Enter" && search()} />
          </div>
          <div className="md:col-span-3 relative">
            <MapPin className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input placeholder="City or region" value={where} onChange={(e) => setWhere(e.target.value)} className="pl-10 h-11" onKeyDown={(e) => e.key === "Enter" && search()} />
          </div>
          <div className="md:col-span-2">
            <Select value={country} onValueChange={setCountry}>
              <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
              <SelectContent>
                {COUNTRIES.map((c) => <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-3">
            <Button onClick={search} disabled={loading} className="w-full h-11 gap-2">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Search jobs
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-4 pt-1">
          <div className="flex items-center gap-2">
            <Switch id="remote" checked={remoteOnly} onCheckedChange={setRemoteOnly} />
            <Label htmlFor="remote" className="text-sm">Remote only</Label>
          </div>
          <Select value={sortBy} onValueChange={(v: "relevance" | "date" | "salary") => setSortBy(v)}>
            <SelectTrigger className="h-9 w-40 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="relevance">Relevance</SelectItem>
              <SelectItem value="date">Most recent</SelectItem>
              <SelectItem value="salary">Highest salary</SelectItem>
            </SelectContent>
          </Select>
          <Input
            placeholder="Filter by company"
            value={companyFilter}
            onChange={(e) => setCompanyFilter(e.target.value)}
            className="h-9 w-48 text-sm"
          />
          {scoring && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Sparkles className="h-3 w-3 animate-pulse" /> AI scoring matches…
            </span>
          )}
        </div>
      </Card>

      {(hasResume === false || noResumeScoringAttempted) && (
        <Card className="p-4 border-warning/40 bg-warning/10">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-semibold text-foreground">Upload a resume to unlock AI match scoring</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Job search still works, but match percentages need your latest resume to compare skills and experience. AI scoring is paused until a resume is uploaded.
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  After upload finishes, keep this page open and scoring will restart automatically.
                </p>
              </div>
            </div>
            <Button onClick={() => navigate("/resume")} className="gap-2 shrink-0">
              <Upload className="h-4 w-4" />
              Upload resume
            </Button>
          </div>
        </Card>
      )}

      <Card className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <Link2 className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Add job by URL</h3>
        </div>
        <p className="text-xs text-muted-foreground mb-3">Paste any job URL (LinkedIn, Greenhouse, company sites) — AI extracts the details.</p>
        <div className="flex gap-2">
          <Input placeholder="https://…" value={pasteUrl} onChange={(e) => setPasteUrl(e.target.value)} className="h-10" />
          <Button onClick={addFromUrl} disabled={pasting || !pasteUrl.trim()} className="gap-2">
            {pasting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Add
          </Button>
        </div>
      </Card>

      <div className="space-y-3">
        {filtered.length === 0 && !loading && (
          <Card className="p-12 text-center text-sm text-muted-foreground">
            <Briefcase className="h-8 w-8 mx-auto mb-3 text-muted-foreground/50" />
            Search above to see live job listings.
          </Card>
        )}
        {filtered.map((job) => (
          <Card key={`${job.source}-${job.external_id}`} className="p-4 hover:border-primary/50 transition-colors">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-start gap-3">
                  <CompanyLogo company={job.company} size={40} className="mt-0.5" />

                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-foreground truncate">{job.title}</h3>
                    <p className="text-sm text-muted-foreground">
                      {job.company || "Unknown"} · {job.location || "Remote"}
                    </p>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {job.remote && <Badge variant="secondary" className="text-xs">Remote</Badge>}
                      {(job.salary_min || job.salary_max) && (
                        <Badge variant="outline" className="text-xs">
                          ${job.salary_min ? Math.round(job.salary_min / 1000) + "k" : "?"} – ${job.salary_max ? Math.round(job.salary_max / 1000) + "k" : "?"}
                        </Badge>
                      )}
                      <Badge variant="outline" className="text-xs">
                        {formatDistanceToNow(new Date(job.posted_at), { addSuffix: true })}
                      </Badge>
                      {typeof job.match_score === "number" && (
                        <Badge className="text-xs bg-primary/15 text-primary border-primary/30 hover:bg-primary/20">
                          <Sparkles className="h-3 w-3 mr-1" /> {job.match_score}% match
                        </Badge>
                      )}
                    </div>
                    {job.match_reason && (
                      <p className="text-xs text-muted-foreground mt-2 italic">{job.match_reason}</p>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex flex-col gap-2 shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => trackJob(job, "saved")}
                  disabled={savingIds.has(job.external_id) || trackedIds.has(job.external_id)}
                  className="gap-1.5"
                >
                  <Bookmark className="h-3.5 w-3.5" />
                  {trackedIds.has(job.external_id) ? "Tracked" : "Save"}
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    window.open(job.url, "_blank", "noopener,noreferrer");
                    trackJob(job, "applied");
                  }}
                  disabled={savingIds.has(job.external_id)}
                  className="gap-1.5"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Apply
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setResearchTarget({ company: job.company || "", role: job.title })}
                  disabled={!job.company}
                  className="gap-1.5"
                  aria-label={`Research ${job.company || "company"}`}
                >
                  <Building2 className="h-3.5 w-3.5" />
                  Research
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <CompanyResearchDialog
        open={!!researchTarget}
        onOpenChange={(o) => !o && setResearchTarget(null)}
        company={researchTarget?.company ?? ""}
        role={researchTarget?.role}
      />
    </div>
  );
}
