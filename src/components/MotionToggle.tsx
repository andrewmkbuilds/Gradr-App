import { Gauge, Monitor, Zap } from "lucide-react";
import { useMotionPreference, type MotionPreference } from "@/hooks/useMotionPreference";
import { cn } from "@/lib/utils";

const OPTIONS: { value: MotionPreference; label: string; icon: typeof Zap; hint: string }[] = [
  { value: "system", label: "System", icon: Monitor, hint: "Follow your device setting" },
  { value: "full", label: "Full", icon: Zap, hint: "All animations and parallax" },
  { value: "reduced", label: "Reduced", icon: Gauge, hint: "Instant, minimal movement" },
];

/**
 * Segmented control for the app-wide motion preference. Changes apply
 * instantly — no reload — because the provider drives both MotionConfig and
 * the `data-motion` attribute used by CSS animations.
 */
export function MotionSegmentedControl({ className }: { className?: string }) {
  const { preference, setPreference, reduced, systemReduced } = useMotionPreference();

  return (
    <div className={cn("space-y-2", className)}>
      <div
        role="radiogroup"
        aria-label="Motion"
        className="inline-flex w-full max-w-sm rounded-lg border border-border bg-surface-secondary p-1"
      >
        {OPTIONS.map(({ value, label, icon: Icon, hint }) => {
          const active = preference === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={active}
              title={hint}
              onClick={() => setPreference(value)}
              className={cn(
                "interactive press-scale flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium",
                active
                  ? "bg-surface text-foreground shadow-sm ring-1 ring-border"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {label}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground" aria-live="polite">
        {reduced
          ? "Motion is reduced: transitions are instant and decorative effects are off."
          : "Full motion is on."}
        {preference === "system" && (
          <> Your device currently reports {systemReduced ? "reduced" : "full"} motion.</>
        )}
      </p>
    </div>
  );
}

export default MotionSegmentedControl;
