import { useEffect, useState } from "react";
import { Sparkles, Loader2, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import {
  PERSONAS,
  DIFFICULTIES,
  DEFAULT_PERSONA,
  DEFAULT_DIFFICULTY,
  type PersonaId,
  type DifficultyId,
  type SessionContext,
} from "@/lib/interview/personas";

interface Props {
  initial?: Partial<SessionContext>;
  onContinue: (ctx: SessionContext) => void;
}

/** Pre-session setup: interviewer persona, difficulty and role/resume grounding. */
export function InterviewSetup({ initial, onContinue }: Props) {
  const [personaId, setPersonaId] = useState<PersonaId>(initial?.personaId ?? DEFAULT_PERSONA);
  const [difficultyId, setDifficultyId] = useState<DifficultyId>(initial?.difficultyId ?? DEFAULT_DIFFICULTY);
  const [targetRole, setTargetRole] = useState(initial?.targetRole ?? "");
  const [company, setCompany] = useState(initial?.company ?? "");
  const [jobDescription, setJobDescription] = useState(initial?.jobDescription ?? "");
  const [resumeText, setResumeText] = useState(initial?.resumeText ?? "");
  const [resumeLabel, setResumeLabel] = useState<string | null>(null);
  const [loadingContext, setLoadingContext] = useState(true);

  // Auto-fill from the user's saved profile and most recent parsed resume.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: userData } = await supabase.auth.getUser();
        const uid = userData.user?.id;
        if (!uid) return;

        const [{ data: profile }, { data: resume }] = await Promise.all([
          supabase.from("profiles").select("target_job_title").eq("user_id", uid).maybeSingle(),
          supabase
            .from("resumes")
            .select("file_name, parsed_text")
            .eq("user_id", uid)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
        ]);
        if (cancelled) return;
        if (!initial?.targetRole && profile?.target_job_title) setTargetRole(profile.target_job_title);
        if (!initial?.resumeText && resume?.parsed_text) {
          setResumeText(resume.parsed_text);
          setResumeLabel(resume.file_name ?? "Latest resume");
        }
      } finally {
        if (!cancelled) setLoadingContext(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="glass-card p-6 space-y-6 animate-slide-up">
      <div>
        <h3 className="text-lg font-semibold text-foreground">Set up your interview</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Pick who's interviewing you and how hard they push. Everything is grounded in your role and resume.
        </p>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Interviewer</p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {PERSONAS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPersonaId(p.id)}
              className={`text-left rounded-xl border p-3 transition-colors ${
                personaId === p.id
                  ? "border-primary bg-primary/10"
                  : "border-border bg-secondary/40 hover:bg-secondary"
              }`}
            >
              <div className="text-sm font-medium text-foreground">{p.label}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{p.blurb}</div>
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Difficulty</p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
          {DIFFICULTIES.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => setDifficultyId(d.id)}
              className={`text-left rounded-xl border p-3 transition-colors ${
                difficultyId === d.id
                  ? "border-primary bg-primary/10"
                  : "border-border bg-secondary/40 hover:bg-secondary"
              }`}
            >
              <div className="text-sm font-medium text-foreground">{d.label}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{d.blurb}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <Input
          placeholder="Target role (e.g. Senior Frontend Engineer)"
          value={targetRole}
          onChange={(e) => setTargetRole(e.target.value)}
          className="bg-secondary border-border"
        />
        <Input
          placeholder="Company (optional)"
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          className="bg-secondary border-border"
        />
      </div>

      <Textarea
        placeholder="Paste the job description (optional) — questions will be grounded in it"
        value={jobDescription}
        onChange={(e) => setJobDescription(e.target.value)}
        rows={4}
        className="bg-secondary border-border resize-none"
      />

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {loadingContext ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading your profile and resume…
          </>
        ) : resumeLabel ? (
          <>
            <FileText className="h-3.5 w-3.5 text-primary" /> Using{" "}
            <span className="text-foreground">{resumeLabel}</span> for personalised questions
          </>
        ) : (
          <>Upload a resume in Resume Intelligence for questions tailored to your real projects.</>
        )}
      </div>

      <Button
        onClick={() =>
          onContinue({
            personaId,
            difficultyId,
            targetRole: targetRole.trim() || undefined,
            company: company.trim() || undefined,
            jobDescription: jobDescription.trim() || undefined,
            resumeText: resumeText || undefined,
          })
        }
        className="bg-primary text-primary-foreground hover:bg-primary/90"
      >
        <Sparkles className="h-4 w-4 mr-2" />
        Continue to device check
      </Button>
    </div>
  );
}
