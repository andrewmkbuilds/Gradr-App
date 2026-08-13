import { useReducedMotionPref } from "@/hooks/useMotionPreference";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Link } from "react-router-dom";
import { Sparkles, Loader2, FileText, Lock, Radio } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
import { stagger, fadeUp, springSnappy } from "@/lib/motion/tokens";
import { entitlementFor, personaAllowed, difficultyAllowed } from "@/lib/interview/entitlements";

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
  const [tier, setTier] = useState<string | null>(null);

  const ent = entitlementFor(tier);
  const reduced = useReducedMotionPref();


  // Auto-fill from the user's saved profile and most recent parsed resume.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: userData } = await supabase.auth.getUser();
        const uid = userData.user?.id;
        if (!uid) return;

        const [{ data: profile }, { data: resume }, { data: sub }] = await Promise.all([
          supabase.from("profiles").select("target_job_title").eq("user_id", uid).maybeSingle(),
          supabase
            .from("resumes")
            .select("file_name, parsed_text")
            .eq("user_id", uid)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase
            .from("subscribers")
            .select("subscribed, subscription_tier")
            .eq("user_id", uid)
            .maybeSingle(),
        ]);
        if (cancelled) return;
        setTier(sub?.subscribed ? (sub.subscription_tier ?? "free") : "free");
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

  // Keep the selection inside what the plan allows once the tier resolves.
  useEffect(() => {
    if (!personaAllowed(ent, personaId)) setPersonaId((ent.personas?.[0] as PersonaId) ?? DEFAULT_PERSONA);
    if (!difficultyAllowed(ent, difficultyId)) {
      setDifficultyId((ent.difficulties?.[0] as DifficultyId) ?? DEFAULT_DIFFICULTY);
    }
  }, [ent, personaId, difficultyId]);


  return (
    <motion.div
      variants={stagger(0.07)}
      initial={reduced ? false : "hidden"}
      animate="show"
      className="elev-3 space-y-6 rounded-2xl p-6 sm:p-7"
    >
      <motion.div variants={fadeUp}>
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-brand-secondary">
          Step 1 of 2
        </p>
        <h3 className="mt-1 font-display text-2xl font-semibold tracking-tight text-foreground">
          Set up your interview
        </h3>
        <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-muted-foreground">
          Pick who's interviewing you and how hard they push. Everything is grounded in your role and resume.
        </p>
      </motion.div>

      <motion.div variants={fadeUp} className="elev-2 flex flex-wrap items-center justify-between gap-3 rounded-xl p-3">
        <div className="flex items-center gap-2 text-sm">
          <Radio className={`h-4 w-4 ${ent.realtimeVoice ? "text-primary" : "text-muted-foreground"}`} />
          <span className="text-foreground">
            {ent.realtimeVoice ? "Realtime voice interview enabled" : "Realtime voice is a Starter & Pro feature"}
          </span>
          <Badge variant="outline" className="capitalize">{ent.label}</Badge>
        </div>
        {!ent.realtimeVoice && (
          <Button asChild size="sm" variant="outline">
            <Link to="/pricing">Upgrade</Link>
          </Button>
        )}
      </motion.div>

      <motion.div variants={fadeUp}>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Interviewer</p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {PERSONAS.map((p) => {
            const locked = !personaAllowed(ent, p.id);
            return (
              <motion.button
                key={p.id}
                type="button"
                disabled={locked}
                onClick={() => setPersonaId(p.id)}
                whileHover={locked || reduced ? undefined : { y: -2 }}
                whileTap={locked || reduced ? undefined : { scale: 0.985 }}
                transition={springSnappy}
                aria-pressed={personaId === p.id}
                className={`relative rounded-xl border p-3 text-left transition-colors ${
                  locked
                    ? "cursor-not-allowed border-border bg-secondary/20 opacity-60"
                    : personaId === p.id
                      ? "border-primary bg-primary/10 shadow-[0_0_0_1px_hsl(var(--primary)/0.35)]"
                      : "border-border bg-secondary/40 hover:border-primary/40 hover:bg-secondary"
                }`}
              >
                <div className="text-sm font-medium text-foreground flex items-center gap-1.5">
                  {p.label}
                  {locked && <Lock className="h-3 w-3 text-muted-foreground" />}
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {locked ? "Unlocks on a higher plan" : p.blurb}
                </div>
              </motion.button>
            );
          })}
        </div>
      </motion.div>

      <motion.div variants={fadeUp}>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Difficulty</p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
          {DIFFICULTIES.map((d) => {
            const locked = !difficultyAllowed(ent, d.id);
            return (
              <motion.button
                key={d.id}
                type="button"
                disabled={locked}
                onClick={() => setDifficultyId(d.id)}
                whileHover={locked || reduced ? undefined : { y: -2 }}
                whileTap={locked || reduced ? undefined : { scale: 0.985 }}
                transition={springSnappy}
                aria-pressed={difficultyId === d.id}
                className={`rounded-xl border p-3 text-left transition-colors ${
                  locked
                    ? "cursor-not-allowed border-border bg-secondary/20 opacity-60"
                    : difficultyId === d.id
                      ? "border-primary bg-primary/10 shadow-[0_0_0_1px_hsl(var(--primary)/0.35)]"
                      : "border-border bg-secondary/40 hover:border-primary/40 hover:bg-secondary"
                }`}
              >
                <div className="text-sm font-medium text-foreground flex items-center gap-1.5">
                  {d.label}
                  {locked && <Lock className="h-3 w-3 text-muted-foreground" />}
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {locked ? "Unlocks on a higher plan" : d.blurb}
                </div>
              </motion.button>
            );
          })}
        </div>
      </motion.div>


      <motion.div variants={fadeUp} className="grid gap-3 sm:grid-cols-2">
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
      </motion.div>

      <Textarea
        placeholder="Paste the job description (optional) — questions will be grounded in it"
        value={jobDescription}
        onChange={(e) => setJobDescription(e.target.value)}
        rows={4}
        className="bg-secondary border-border resize-none"
      />

      <motion.div variants={fadeUp} className="flex items-center gap-2 text-xs text-muted-foreground">
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
      </motion.div>

      <Button
        onClick={() => {
          const nextContext: SessionContext = {
            personaId,
            difficultyId,
          };
          const role = targetRole.trim();
          const companyName = company.trim();
          const description = jobDescription.trim();
          if (role) nextContext.targetRole = role;
          if (companyName) nextContext.company = companyName;
          if (description) nextContext.jobDescription = description;
          if (resumeText) nextContext.resumeText = resumeText;
          onContinue(nextContext);
        }}
        className="bg-primary text-primary-foreground hover:bg-primary/90"
      >
        <Sparkles className="mr-2 h-4 w-4" />
        Continue to device check
      </Button>
    </motion.div>
  );
}
