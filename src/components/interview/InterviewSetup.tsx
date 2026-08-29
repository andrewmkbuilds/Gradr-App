import { useReducedMotionPref } from "@/hooks/useMotionPreference";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { motion } from "motion/react";
import { Link } from "react-router-dom";
import { AlertCircle, Info, Sparkles, Loader2, FileText, Lock, Radio } from "lucide-react";
import { Button } from "@/components/ds/Button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  LIMITS,
  buildSessionContext,
  validateSetup,
  type SetupField,
} from "@/lib/interview/setupValidation";
import {
  DEFAULT_TURN_TIMING,
  TURN_TIMING_LIMITS,
  normalizeTurnTiming,
  saveTurnTiming,
  type TurnTiming,
} from "@/lib/interview/turnTaking";

interface Props {
  initial?: Partial<SessionContext>;
  /** Candidate-configurable end-of-turn and barge-in timing. */
  turnTiming?: TurnTiming;
  onTurnTimingChange?: (timing: TurnTiming) => void;
  onContinue: (ctx: SessionContext) => void;
}

/** One labelled optional field with inline error / advisory messaging. */
function Field({
  id,
  label,
  hint,
  error,
  warning,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string | undefined;
  warning?: string | undefined;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <Label htmlFor={id}>{label}</Label>
        {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
      </div>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="flex items-start gap-1.5 text-xs text-destructive">
          <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : warning ? (
        <p id={`${id}-warning`} className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-3 w-3 shrink-0 text-brand-secondary" aria-hidden="true" />
          {warning}
        </p>
      ) : null}
    </div>
  );
}

/** Pre-session setup: interviewer persona, difficulty and role/resume grounding. */
export function InterviewSetup({ initial, turnTiming, onTurnTimingChange, onContinue }: Props) {
  const timing = normalizeTurnTiming(turnTiming ?? DEFAULT_TURN_TIMING);
  const updateTiming = (patch: Partial<TurnTiming>) => {
    const next = normalizeTurnTiming({ ...timing, ...patch });
    saveTurnTiming(next);
    onTurnTimingChange?.(next);
  };
  const [personaId, setPersonaId] = useState<PersonaId>(initial?.personaId ?? DEFAULT_PERSONA);
  const [difficultyId, setDifficultyId] = useState<DifficultyId>(initial?.difficultyId ?? DEFAULT_DIFFICULTY);
  const [targetRole, setTargetRole] = useState(initial?.targetRole ?? "");
  const [company, setCompany] = useState(initial?.company ?? "");
  const [jobDescription, setJobDescription] = useState(initial?.jobDescription ?? "");
  const [resumeText, setResumeText] = useState(initial?.resumeText ?? "");
  const [resumeLabel, setResumeLabel] = useState<string | null>(null);
  const [loadingContext, setLoadingContext] = useState(true);
  const [tier, setTier] = useState<string | null>(null);
  const [touched, setTouched] = useState<Partial<Record<SetupField, boolean>>>({});
  const [attempted, setAttempted] = useState(false);

  const ent = entitlementFor(tier);
  const reduced = useReducedMotionPref();

  const validation = useMemo(
    () => validateSetup({ targetRole, company, jobDescription }),
    [targetRole, company, jobDescription],
  );

  // Only surface a field's message once the user has left it, or once they've
  // tried to continue — typing "S" for "Senior" shouldn't read as an error.
  const showIssues: Record<SetupField, boolean> = {
    targetRole: Boolean(touched.targetRole) || attempted,
    company: Boolean(touched.company) || attempted,
    jobDescription: Boolean(touched.jobDescription) || attempted,
  };

  const touch = (field: SetupField) => setTouched((prev) => ({ ...prev, [field]: true }));

  const describedBy = (id: string, field: SetupField) => {
    if (!showIssues[field]) return undefined;
    if (validation.errors[field]) return `${id}-error`;
    if (validation.warnings[field]) return `${id}-warning`;
    return undefined;
  };



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
            {ent.realtimeVoice ? "Studio voice interview enabled" : "Studio voice is a Starter & Pro feature"}
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


      <motion.div variants={fadeUp} className="grid gap-4 sm:grid-cols-2">
        <Field
          id="interview-target-role"
          label="Target role"
          hint="Optional — improves question relevance"
          error={showIssues.targetRole ? validation.errors.targetRole : undefined}
          warning={showIssues.targetRole ? validation.warnings.targetRole : undefined}
        >
          <Input
            id="interview-target-role"
            placeholder="e.g. Senior Frontend Engineer"
            value={targetRole}
            maxLength={LIMITS.targetRole.max + 20}
            onChange={(e) => setTargetRole(e.target.value)}
            onBlur={() => touch("targetRole")}
            aria-invalid={Boolean(validation.errors.targetRole) || undefined}
            aria-describedby={describedBy("interview-target-role", "targetRole")}
          />
        </Field>
        <Field
          id="interview-company"
          label="Company"
          hint="Optional — tailors culture and product questions"
          error={showIssues.company ? validation.errors.company : undefined}
          warning={showIssues.company ? validation.warnings.company : undefined}
        >
          <Input
            id="interview-company"
            placeholder="e.g. Northwind"
            value={company}
            maxLength={LIMITS.company.max + 20}
            onChange={(e) => setCompany(e.target.value)}
            onBlur={() => touch("company")}
            aria-invalid={Boolean(validation.errors.company) || undefined}
            aria-describedby={describedBy("interview-company", "company")}
          />
        </Field>
      </motion.div>

      <motion.div variants={fadeUp}>
        <Field
          id="interview-jd"
          label="Job description"
          hint={
            jobDescription.trim().length
              ? `${jobDescription.trim().length.toLocaleString()} / ${LIMITS.jobDescription.max.toLocaleString()} characters`
              : "Optional — questions will be grounded in it"
          }
          error={showIssues.jobDescription ? validation.errors.jobDescription : undefined}
          warning={showIssues.jobDescription ? validation.warnings.jobDescription : undefined}
        >
          <Textarea
            id="interview-jd"
            placeholder="Paste the job posting here"
            value={jobDescription}
            onChange={(e) => setJobDescription(e.target.value)}
            onBlur={() => touch("jobDescription")}
            rows={4}
            aria-invalid={Boolean(validation.errors.jobDescription) || undefined}
            aria-describedby={describedBy("interview-jd", "jobDescription")}
            className="resize-none"
          />
        </Field>
      </motion.div>

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

      <motion.div variants={fadeUp} className="space-y-4 rounded-xl border border-border bg-secondary/30 p-4">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-foreground">Turn timing</h3>
          <p className="text-xs text-muted-foreground">
            How the interviewer shares the floor with you. Raise the pause if you think out loud;
            lower it for a snappier loop.
          </p>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-3">
            <Label htmlFor="turn-end-of-turn">Pause before your answer is submitted</Label>
            <span className="text-[11px] tabular-nums text-muted-foreground">
              {(timing.endOfTurnMs / 1000).toFixed(1)}s
            </span>
          </div>
          <input
            id="turn-end-of-turn"
            type="range"
            className="w-full accent-primary"
            min={TURN_TIMING_LIMITS.endOfTurnMs.min}
            max={TURN_TIMING_LIMITS.endOfTurnMs.max}
            step={TURN_TIMING_LIMITS.endOfTurnMs.step}
            value={timing.endOfTurnMs}
            onChange={(e) => updateTiming({ endOfTurnMs: Number(e.target.value) })}
            aria-describedby="turn-end-of-turn-hint"
          />
          <p id="turn-end-of-turn-hint" className="text-xs text-muted-foreground">
            Trailing words like “and…” automatically buy you extra time on top of this.
          </p>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-3">
            <Label htmlFor="turn-barge-in">Hand-over beat before the mic opens</Label>
            <span className="text-[11px] tabular-nums text-muted-foreground">{timing.bargeInMs} ms</span>
          </div>
          <input
            id="turn-barge-in"
            type="range"
            className="w-full accent-primary"
            min={TURN_TIMING_LIMITS.bargeInMs.min}
            max={TURN_TIMING_LIMITS.bargeInMs.max}
            step={TURN_TIMING_LIMITS.bargeInMs.step}
            value={timing.bargeInMs}
            onChange={(e) => updateTiming({ bargeInMs: Number(e.target.value) })}
            aria-describedby="turn-barge-in-hint"
          />
          <p id="turn-barge-in-hint" className="text-xs text-muted-foreground">
            Keeps the interviewer's last word out of your recording. You can always cut in with the mic button.
          </p>
        </div>
      </motion.div>

      <motion.div variants={fadeUp} className="space-y-3">
        {attempted && !validation.valid && (
          <p id="interview-setup-blocked" role="alert" className="flex items-start gap-2 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            Fix the highlighted fields before starting — or clear them, since they're all optional.
          </p>
        )}
        <Button
          onClick={() => {
            setAttempted(true);
            setTouched({ targetRole: true, company: true, jobDescription: true });
            if (!validation.valid) return;
            onContinue(
              buildSessionContext({
                personaId,
                difficultyId,
                draft: { targetRole, company, jobDescription },
                ...(resumeText ? { resumeText } : {}),
              }),
            );
          }}
          aria-describedby={attempted && !validation.valid ? "interview-setup-blocked" : undefined}
        >
          <Sparkles className="mr-2 h-4 w-4" />
          Continue to device check
        </Button>
      </motion.div>
    </motion.div>
  );
}
