import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Loader2, Sparkles, Target } from "lucide-react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Seo } from "@/components/Seo";
import { useNavigate, useSearchParams } from "@/lib/router-compat";
import { useCareerPreferences } from "@/hooks/useCareerPreferences";
import {
  EXPERIENCE_OPTIONS,
  INDUSTRY_OPTIONS,
  JOB_TYPE_OPTIONS,
  REMOTE_OPTIONS,
  targetingSummary,
  type CareerPreferences,
} from "@/lib/careerPrefs";

const ROLE_SUGGESTIONS = [
  "Software Engineer",
  "Product Manager",
  "Data Analyst",
  "UX Designer",
  "Marketing Manager",
  "Business Analyst",
  "DevOps Engineer",
  "Sales Development Rep",
];

const money = (n: number) => `$${Math.round(n / 1000)}k`;

function Chip({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
        selected
          ? "border-mahogany bg-mahogany-soft text-mahogany-ink"
          : "border-border bg-secondary/40 text-muted-foreground hover:border-primary/40 hover:text-foreground"
      }`}
    >
      {selected && <Check className="accent-text mr-1.5 inline h-3.5 w-3.5" aria-hidden />}
      {label}
    </button>
  );
}

const STEPS = ["Roles", "Industries", "Pay & place", "Confirm"] as const;

export default function Onboarding() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const nextPath = params.get("next") ?? "/";
  const { preferences, isLoading, savePreferences, isSaving } = useCareerPreferences();
  const reduce = useReducedMotion();

  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<CareerPreferences>(preferences);
  const [roleInput, setRoleInput] = useState("");
  const [locationInput, setLocationInput] = useState("");

  // Hydrate once the saved preferences land (editing an existing profile).
  useEffect(() => {
    if (!isLoading) setDraft((d) => (d.targetRoles.length === 0 ? preferences : d));
  }, [isLoading, preferences]);

  const toggle = (key: "industries" | "jobTypes", value: string) =>
    setDraft((d) => ({
      ...d,
      [key]: d[key].includes(value) ? d[key].filter((v) => v !== value) : [...d[key], value],
    }));

  const addRole = (value: string) => {
    const v = value.trim();
    if (!v || draft.targetRoles.includes(v) || draft.targetRoles.length >= 5) return;
    setDraft((d) => ({ ...d, targetRoles: [...d.targetRoles, v] }));
    setRoleInput("");
  };

  const canContinue = useMemo(() => {
    if (step === 0) return draft.targetRoles.length > 0;
    return true;
  }, [step, draft.targetRoles.length]);

  const finish = async () => {
    try {
      await savePreferences(draft);
      toast.success("Targeting saved — your matches and briefing are updated");
      navigate(nextPath);
    } catch {
      toast.error("We couldn't save your preferences. Try again.");
    }
  };

  return (
    <div className="mx-auto max-w-3xl py-8">
      <Seo
        title="Set up your career targeting"
        description="Tell Gradr the roles, industries and salary range you're aiming for so matches and your daily briefing are personalised."
        path="/onboarding"
      />

      <header className="mb-6">
        <p className="accent-text flex items-center gap-2 text-xs uppercase tracking-[0.2em]">
          <Sparkles className="h-3.5 w-3.5" aria-hidden /> Personalise Gradr
        </p>
        <h1 className="font-display mt-2 text-3xl font-bold tracking-tight text-foreground">
          What are you aiming for?
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Four quick questions. We use them to re-rank every job match and to sequence your daily actions.
        </p>
      </header>

      <ol className="mb-6 flex items-center gap-2" aria-label="Onboarding progress">
        {STEPS.map((label, i) => (
          <li key={label} className="flex flex-1 items-center gap-2">
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-medium ${
                i < step
                  ? "bg-primary text-primary-foreground"
                  : i === step
                    ? "bg-mahogany-soft text-mahogany-ink ring-1 ring-mahogany"
                    : "bg-secondary text-muted-foreground"
              }`}
              aria-current={i === step ? "step" : undefined}
            >
              {i < step ? <Check className="h-3.5 w-3.5" aria-hidden /> : i + 1}
            </span>
            <span className={`hidden text-xs sm:block ${i === step ? "text-foreground" : "text-muted-foreground"}`}>
              {label}
            </span>
            {i < STEPS.length - 1 && <span className="h-px flex-1 bg-border" aria-hidden />}
          </li>
        ))}
      </ol>

      <div className="glass-card p-6">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={step}
            initial={reduce ? false : { opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduce ? undefined : { opacity: 0, x: -16 }}
            transition={{ duration: 0.22 }}
          >
            {step === 0 && (
              <section aria-labelledby="step-roles">
                <h2 id="step-roles" className="text-sm font-semibold text-foreground">
                  Which roles are you targeting?
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">Add up to five. The first one leads your searches.</p>

                <div className="mt-4 flex gap-2">
                  <Input
                    value={roleInput}
                    onChange={(e) => setRoleInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addRole(roleInput);
                      }
                    }}
                    placeholder="e.g. Frontend Engineer"
                    aria-label="Target role"
                  />
                  <Button type="button" variant="secondary" onClick={() => addRole(roleInput)} disabled={!roleInput.trim()}>
                    Add
                  </Button>
                </div>

                {draft.targetRoles.length > 0 && (
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {draft.targetRoles.map((r) => (
                      <li key={r}>
                        <Chip
                          label={r}
                          selected
                          onClick={() => setDraft((d) => ({ ...d, targetRoles: d.targetRoles.filter((x) => x !== r) }))}
                        />
                      </li>
                    ))}
                  </ul>
                )}

                <p className="mt-5 text-xs uppercase tracking-wider text-muted-foreground">Popular targets</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {ROLE_SUGGESTIONS.filter((r) => !draft.targetRoles.includes(r)).map((r) => (
                    <Chip key={r} label={r} selected={false} onClick={() => addRole(r)} />
                  ))}
                </div>

                <div className="mt-6">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">Experience level</Label>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {EXPERIENCE_OPTIONS.map((o) => (
                      <Chip
                        key={o.value}
                        label={o.label}
                        selected={draft.experienceLevel === o.value}
                        onClick={() => setDraft((d) => ({ ...d, experienceLevel: o.value }))}
                      />
                    ))}
                  </div>
                </div>
              </section>
            )}

            {step === 1 && (
              <section aria-labelledby="step-industries">
                <h2 id="step-industries" className="text-sm font-semibold text-foreground">
                  Which industries interest you?
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">Pick any that apply — this boosts matching, it never filters roles out.</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {INDUSTRY_OPTIONS.map((i) => (
                    <Chip key={i} label={i} selected={draft.industries.includes(i)} onClick={() => toggle("industries", i)} />
                  ))}
                </div>

                <div className="mt-6">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">Job type</Label>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {JOB_TYPE_OPTIONS.map((t) => (
                      <Chip key={t} label={t} selected={draft.jobTypes.includes(t)} onClick={() => toggle("jobTypes", t)} />
                    ))}
                  </div>
                </div>
              </section>
            )}

            {step === 2 && (
              <section aria-labelledby="step-pay">
                <h2 id="step-pay" className="text-sm font-semibold text-foreground">
                  Pay expectations and where you'd work
                </h2>

                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="salary-min" className="text-xs uppercase tracking-wider text-muted-foreground">
                      Minimum salary (USD)
                    </Label>
                    <Input
                      id="salary-min"
                      type="number"
                      min={0}
                      step={5000}
                      value={draft.salaryMin ?? ""}
                      onChange={(e) => setDraft((d) => ({ ...d, salaryMin: e.target.value ? Number(e.target.value) : null }))}
                      placeholder="70000"
                    />
                  </div>
                  <div>
                    <Label htmlFor="salary-max" className="text-xs uppercase tracking-wider text-muted-foreground">
                      Target salary (USD)
                    </Label>
                    <Input
                      id="salary-max"
                      type="number"
                      min={0}
                      step={5000}
                      value={draft.salaryMax ?? ""}
                      onChange={(e) => setDraft((d) => ({ ...d, salaryMax: e.target.value ? Number(e.target.value) : null }))}
                      placeholder="110000"
                    />
                  </div>
                </div>

                <div className="mt-5">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">Work style</Label>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {REMOTE_OPTIONS.map((o) => (
                      <Chip
                        key={o.value}
                        label={o.label}
                        selected={draft.remotePreference === o.value}
                        onClick={() => setDraft((d) => ({ ...d, remotePreference: o.value }))}
                      />
                    ))}
                  </div>
                </div>

                <div className="mt-5">
                  <Label htmlFor="location" className="text-xs uppercase tracking-wider text-muted-foreground">
                    Preferred locations
                  </Label>
                  <div className="mt-2 flex gap-2">
                    <Input
                      id="location"
                      value={locationInput}
                      onChange={(e) => setLocationInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          const v = locationInput.trim();
                          if (v && !draft.locations.includes(v)) {
                            setDraft((d) => ({ ...d, locations: [...d.locations, v] }));
                            setLocationInput("");
                          }
                        }
                      }}
                      placeholder="e.g. London, Berlin"
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={!locationInput.trim()}
                      onClick={() => {
                        const v = locationInput.trim();
                        if (v && !draft.locations.includes(v)) {
                          setDraft((d) => ({ ...d, locations: [...d.locations, v] }));
                          setLocationInput("");
                        }
                      }}
                    >
                      Add
                    </Button>
                  </div>
                  {draft.locations.length > 0 && (
                    <ul className="mt-3 flex flex-wrap gap-2">
                      {draft.locations.map((l) => (
                        <li key={l}>
                          <Chip
                            label={l}
                            selected
                            onClick={() => setDraft((d) => ({ ...d, locations: d.locations.filter((x) => x !== l) }))}
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </section>
            )}

            {step === 3 && (
              <section aria-labelledby="step-confirm">
                <h2 id="step-confirm" className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Target className="h-4 w-4 text-primary" aria-hidden /> Your targeting
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Matches re-rank against this immediately, and your daily briefing sequences actions around it.
                </p>

                <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                  <Summary term="Roles" value={draft.targetRoles.join(", ") || "Not set"} />
                  <Summary term="Industries" value={draft.industries.join(", ") || "Any"} />
                  <Summary term="Job types" value={draft.jobTypes.join(", ") || "Any"} />
                  <Summary
                    term="Salary"
                    value={
                      draft.salaryMin || draft.salaryMax
                        ? `${draft.salaryMin ? money(draft.salaryMin) : "—"} – ${draft.salaryMax ? money(draft.salaryMax) : "—"}`
                        : "Not set"
                    }
                  />
                  <Summary
                    term="Work style"
                    value={REMOTE_OPTIONS.find((o) => o.value === draft.remotePreference)?.label ?? "Any"}
                  />
                  <Summary term="Locations" value={draft.locations.join(", ") || "Anywhere"} />
                </dl>

                <p className="mt-4 rounded-lg bg-secondary/50 px-3.5 py-2.5 text-xs text-muted-foreground">
                  Summary: {targetingSummary(draft) || "no targeting set yet"}
                </p>
              </section>
            )}
          </motion.div>
        </AnimatePresence>

        <div className="mt-8 flex items-center justify-between gap-3">
          <Button
            type="button"
            variant="ghost"
            onClick={() => (step === 0 ? navigate(nextPath) : setStep((s) => s - 1))}
            disabled={isSaving}
          >
            {step === 0 ? (
              "Skip for now"
            ) : (
              <>
                <ArrowLeft className="mr-2 h-4 w-4" aria-hidden /> Back
              </>
            )}
          </Button>

          {step < STEPS.length - 1 ? (
            <Button type="button" onClick={() => setStep((s) => s + 1)} disabled={!canContinue}>
              Continue <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
            </Button>
          ) : (
            <Button type="button" onClick={finish} disabled={isSaving}>
              {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <Check className="mr-2 h-4 w-4" aria-hidden />}
              Save and re-rank matches
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function Summary({ term, value }: { term: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-secondary/30 p-3">
      <dt className="text-xs uppercase tracking-wider text-muted-foreground">{term}</dt>
      <dd className="mt-1 text-sm text-foreground">{value}</dd>
    </div>
  );
}
