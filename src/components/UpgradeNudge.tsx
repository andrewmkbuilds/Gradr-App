import { ArrowUpRight, Sparkles, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "@/lib/router-compat";
import { useCredits, useEntitlements } from "@/hooks/useSubscription";

const DISMISS_KEY = "gradr:upgrade-nudge-dismissed";
const FEATURE_LABEL: Record<string, string> = {
  resume: "resume analyses",
  application: "application packs",
  interview: "mock interviews",
};

/**
 * Conversion surface: appears only when the user is genuinely close to (or at)
 * a plan limit, names the exact feature that is running out, and links to
 * pricing with attribution. Dismissible for the rest of the month.
 */
export function UpgradeNudge() {
  const { data: snapshot } = useEntitlements();
  const { data: credits } = useCredits();
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem(DISMISS_KEY);
    const month = new Date().toISOString().slice(0, 7);
    setDismissed(stored === month);
  }, []);

  const tier = snapshot?.tier ?? "free";
  if (dismissed || tier === "pro" || tier === "advanced" || !snapshot) return null;

  const extra = (key: string) =>
    key === "application"
      ? credits?.application_credits ?? 0
      : key === "interview"
        ? credits?.interview_credits ?? 0
        : 0;

  // The most constrained feature: exhausted first, otherwise 80%+ consumed.
  const pressured = (["resume", "application", "interview"] as const)
    .map((key) => {
      const f = snapshot.features[key] ?? { allowance: 0, used: 0, remaining: 0 };
      if (f.allowance === null) return null;
      const allowance = f.allowance ?? 0;
      if (allowance <= 0) return null;
      const remaining = Math.max(f.remaining ?? 0, 0) + extra(key);
      const ratio = f.used / allowance;
      if (remaining > 0 && ratio < 0.8) return null;
      return { key, remaining, ratio };
    })
    .filter(Boolean)
    .sort((a, b) => a!.remaining - b!.remaining)[0];

  if (!pressured) return null;

  const out = pressured.remaining <= 0;
  const label = FEATURE_LABEL[pressured.key] ?? pressured.key;

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, new Date().toISOString().slice(0, 7));
    setDismissed(true);
  };

  return (
    <section
      className="glass-card relative overflow-hidden border-primary/30 p-5"
      aria-label="Plan limit reached"
    >
      <div
        className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-primary/20 blur-3xl"
        aria-hidden
      />
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss upgrade suggestion"
        className="absolute right-3 top-3 rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>

      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 pr-6">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-primary">
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            {out ? "You're out of" : "Running low on"} {label}
          </p>
          <h2 className="mt-1.5 text-sm font-semibold text-foreground">
            {out
              ? `Upgrade to keep going without waiting for the monthly reset.`
              : `${pressured.remaining} ${label} left on your ${tier} plan this month.`}
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Pro removes the caps on resume scoring, application packs and mock interviews — the three
            things that actually move interviews.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button
            size="sm"
            className="gap-1.5"
            onClick={() =>
              navigate(`/pricing?utm_source=app&utm_medium=nudge&utm_campaign=limit_${pressured.key}`)
            }
          >
            See Pro <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => navigate("/billing")}>
            Billing
          </Button>
        </div>
      </div>
    </section>
  );
}
