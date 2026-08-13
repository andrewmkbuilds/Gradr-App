import { Crosshair, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "@/lib/router-compat";
import { useCareerPreferences } from "@/hooks/useCareerPreferences";
import { targetingSummary } from "@/lib/careerPrefs";

/**
 * Shows the targeting Gradr is currently ranking against — or prompts the user
 * to set it up if they never completed onboarding.
 */
export function TargetingCard() {
  const { preferences, isLoading } = useCareerPreferences();
  const navigate = useNavigate();

  if (isLoading) return <div className="h-24 animate-pulse rounded-2xl bg-secondary/40" aria-hidden />;

  if (!preferences.onboarded || preferences.targetRoles.length === 0) {
    return (
      <section aria-labelledby="targeting-heading" className="glass-card flex flex-wrap items-center gap-4 p-5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15">
          <Sparkles className="h-5 w-5 text-primary" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="targeting-heading" className="text-sm font-semibold text-foreground">
            Tell Gradr what you're aiming for
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Target roles, industries and salary range — matches re-rank instantly and your daily actions follow.
          </p>
        </div>
        <Button onClick={() => navigate("/onboarding")}>Set my targeting</Button>
      </section>
    );
  }

  return (
    <section aria-labelledby="targeting-heading" className="glass-card flex flex-wrap items-center gap-4 p-5">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary">
        <Crosshair className="h-5 w-5 text-primary" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <h2 id="targeting-heading" className="text-xs uppercase tracking-wider text-muted-foreground">
          Ranking against
        </h2>
        <p className="mt-0.5 truncate text-sm text-foreground">{targetingSummary(preferences)}</p>
      </div>
      <Button variant="ghost" size="sm" onClick={() => navigate("/onboarding")}>
        Edit targeting
      </Button>
    </section>
  );
}
