import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Search, Loader2, MapPin, Briefcase, ExternalLink, Bookmark, Sparkles, Link2 } from "lucide-react";
import { toast } from "sonner";
import { handleAiFunctionError } from "@/lib/aiErrors";
import { formatDistanceToNow } from "date-fns";

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

  useEffect(() => {
    loadPrefs();
    loadTracked();
  }, [user]);

  const loadPrefs = async () => {
    if (!user) return;
    const { data } = await supabase.from("user_preferences").select("*").eq("user_id", user.id).maybeSingle();
    if (data) {
      setWhat(data.target_role || "");
      setWhere(data.locations?.[0] || "");
      setCountry(data.country || "us");
      if (data.remote_preference === "remote") setRemoteOnly(true);
    }
  };

  const loadTracked = async () => {
    if (!user) return;
    const { data } = await supabase.from("tracked_jobs").select("external_id").eq("user_id", user.id);
    if (data) setTrackedIds(new Set(data.map((d) => d.external_id).filter(Boolean) as string[]));
  };

  const savePrefs = async () => {
    if (!user) return;
    await supabase.from("user_preferences").upsert(
      {
        user_id: user.id,
        target_role: what,
        locations: where ? [where] : [],
        country,
        remote_preference: remoteOnly ? "remote" : "any",
      },
      { onConflict: "user_id" },
    );
  };

  const search = async () => {
    if (!user) return;
    setLoading(true);
    setJobs([]);
    try {
      const { data, error } = await supabase.functions.invoke("search-jobs", {
        body: { what, where, country, remoteOnly, sortBy },
      });
      if (error || data?.error) {
        if (!handleAiFunctionError(error, data)) toast.error(data?.error || "Search failed");
        return;
      }
      setJobs(data.jobs || []);
      savePrefs();
      // Kick off AI scoring against latest resume in background
      scoreJobs(data.jobs || []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Search failed");
    } finally {
      setLoading(false);
    }
  };

  const scoreJobs = async (list: FeedJob[]) => {
    if (!user || list.length === 0) return;
    const { data: resumeRows } = await supabase
      .from("resumes")
      .select("parsed_text")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1);
    const resumeText = resumeRows?.[0]?.parsed_text;
    if (!resumeText) return;

    setScoring(true);
    try {
      const { data, error } = await supabase.functions.invoke("recommend-jobs", {
        body: { jobs: list, resumeText },
      });
      if (error || data?.error) return; // silent fail
      const scores: { i: number; score: number; reason: string }[] = data?.scores || [];
      setJobs((prev) => {
        const next = [...prev];
        scores.forEach((s) => {
          if (next[s.i]) {
            next[s.i] = { ...next[s.i], match_score: s.score, match_reason: s.reason };
          }
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
      const { error } = await supabase.from("tracked_jobs").upsert(
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
      );
      if (error) throw error;
      setTrackedIds((s) => new Set(s).add(job.external_id));
      toast.success(status === "applied" ? "Marked as applied" : "Saved to pipeline");
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

  const addFromUrl = async () => {
    if (!user || !pasteUrl.trim()) return;
    setPasting(true);
    try {
      const { data, error } = await supabase.functions.invoke("parse-job-url", {
        body: { url: pasteUrl.trim() },
      });
      if (error || data?.error) {
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
        status: "saved",
      });
      if (insErr) throw insErr;
      setPasteUrl("");
      toast.success("Job added to pipeline");
    } catch (e) {
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
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Job Feed</h1>
        <p className="text-sm text-muted-foreground mt-1">Search live job listings powered by Adzuna with AI match scoring.</p>
      </div>

      {/* Search bar */}
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

      {/* Paste URL */}
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

      {/* Results */}
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
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <span className="text-sm font-bold text-primary">{(job.company || "?")[0]?.toUpperCase()}</span>
                  </div>
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
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
