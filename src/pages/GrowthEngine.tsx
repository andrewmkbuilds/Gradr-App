import { NextActionBar } from "@/components/NextActionBar";
import { useEffect, useMemo, useState } from "react";
import { Link } from "@/lib/router-compat";
import { ArrowRight, Loader2, Sparkles, Target, TrendingUp } from "lucide-react";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface MatchRow {
  job_title: string;
  company: string | null;
  missing_skills: string[] | null;
  matched_skills: string[] | null;
  match_score: number | null;
}

interface ResumeRow {
  file_name: string;
  version_label: string | null;
  ats_score: number | null;
  keyword_match: number | null;
  formatting_score: number | null;
  impact_score: number | null;
  readability_score: number | null;
}

export default function GrowthEngine() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [resume, setResume] = useState<ResumeRow | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user) {
        setLoading(false);
        return;
      }
      const [matchRes, resumeRes] = await Promise.all([
        supabase
          .from("job_matches")
          .select("job_title, company, missing_skills, matched_skills, match_score")
          .order("created_at", { ascending: false })
          .limit(60),
        supabase
          .from("resumes")
          .select(
            "file_name, version_label, ats_score, keyword_match, formatting_score, impact_score, readability_score",
          )
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      if (cancelled) return;
      setMatches((matchRes.data ?? []) as MatchRow[]);
      setResume((resumeRes.data ?? null) as ResumeRow | null);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const gaps = useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of matches) {
      for (const skill of m.missing_skills ?? []) {
        const key = skill.trim();
        if (!key) continue;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([skill, count]) => ({ skill, count }));
  }, [matches]);

  const strengths = useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of matches) {
      for (const skill of m.matched_skills ?? []) {
        const key = skill.trim();
        if (!key) continue;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([skill]) => skill);
  }, [matches]);

  const resumeWeaknesses = useMemo(() => {
    if (!resume) return [];
    const rows: { label: string; value: number | null }[] = [
      { label: "Keyword coverage", value: resume.keyword_match },
      { label: "Formatting", value: resume.formatting_score },
      { label: "Impact / quantified results", value: resume.impact_score },
      { label: "Readability", value: resume.readability_score },
    ];
    return rows
      .filter((m): m is { label: string; value: number } => typeof m.value === "number" && m.value < 75)
      .sort((a, b) => a.value - b.value);
  }, [resume]);

  const maxCount = gaps[0]?.count ?? 1;
  const hasData = gaps.length > 0 || resumeWeaknesses.length > 0;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <NextActionBar surface="growth" />
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Growth &amp; Proof</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Skill gaps computed from your real resume scores and the jobs you have matched against — no generic advice.
        </p>
      </div>

      {loading ? (
        <div className="glass-card flex items-center gap-2 p-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Reading your resume and match history…
        </div>
      ) : !hasData ? (
        <div id="skill-gaps" className="glass-card p-6 sm:p-8">
          <h2 className="text-sm font-semibold text-foreground">Nothing to analyse yet</h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Growth &amp; Proof is built entirely from your own data. Analyse a resume and match it against a few live
            roles, and your ranked skill gaps will appear here.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button asChild className="min-h-11">
              <Link to="/match">
                Match against live jobs <ArrowRight className="ml-1.5 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" className="min-h-11">
              <Link to="/resume">Analyse your resume</Link>
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div id="skill-gaps" className="glass-card p-6 scroll-mt-20 lg:col-span-2">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Target className="h-4 w-4 text-primary" /> Top skill gaps across {matches.length} matched roles
            </h2>
            {gaps.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">
                No missing skills detected in your matches yet — match a few more roles to build a reliable signal.
              </p>
            ) : (
              <ul className="mt-4 space-y-3">
                {gaps.map((g) => (
                  <li key={g.skill}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="font-medium text-foreground">{g.skill}</span>
                      <span className="text-muted-foreground">
                        missing in {g.count} of {matches.length} roles
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-secondary">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${Math.round((g.count / maxCount) * 100)}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div id="proof" className="space-y-6 scroll-mt-20">
            <div className="glass-card p-6">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <TrendingUp className="h-4 w-4 text-primary" /> Resume weak points
              </h2>
              {resume ? (
                <>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {resume.version_label || resume.file_name}
                  </p>
                  {resumeWeaknesses.length === 0 ? (
                    <p className="mt-3 text-sm text-muted-foreground">
                      All sub-scores are above 75. Focus on the skill gaps instead.
                    </p>
                  ) : (
                    <ul className="mt-3 space-y-2">
                      {resumeWeaknesses.map((w) => (
                        <li key={w.label} className="flex items-center justify-between rounded-lg bg-secondary/40 p-3">
                          <span className="text-xs text-foreground">{w.label}</span>
                          <span className="text-xs font-medium text-warning">{w.value}%</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">Analyse a resume to see sub-score weak points.</p>
              )}
              <Button asChild variant="outline" size="sm" className="mt-4 w-full">
                <Link to="/resume">Open Resume Intelligence</Link>
              </Button>
            </div>

            {strengths.length > 0 && (
              <div className="glass-card p-6">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Sparkles className="h-4 w-4 text-success" /> Proven strengths
                </h2>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {strengths.map((s) => (
                    <span key={s} className="rounded-md bg-success/10 px-2 py-1 text-xs text-success">
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
