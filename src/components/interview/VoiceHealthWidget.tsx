import { useCallback, useEffect, useState } from "react";
import { AudioLines, Loader2, RefreshCw, ShieldAlert, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ds/Button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { fetchVoiceHealth, type VoiceHealth } from "@/lib/interview/voiceStatus";
import { voiceReasonCopy } from "@/lib/interview/voiceErrors";
import { cn } from "@/lib/utils";

/**
 * Live voice-provider health for the interview header.
 *
 * Surfaces auth/entitlement standing and the exact last failure code so a
 * candidate (or an admin sitting in) can tell instantly whether the silence is
 * a plan problem, an account hold, or a transient outage — without logs.
 */
export function VoiceHealthWidget({ className }: { className?: string }) {
  const [health, setHealth] = useState<VoiceHealth | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setHealth(await fetchVoiceHealth());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(id);
  }, [load]);

  const state: "ok" | "warn" | "blocked" = !health
    ? "warn"
    : !health.configured
    ? "blocked"
    : !health.entitled
    ? "blocked"
    : health.healthy
    ? "ok"
    : "warn";

  const label = state === "ok" ? "Voice healthy" : state === "blocked" ? "Voice blocked" : "Voice degraded";
  const reasonCopy = voiceReasonCopy(health?.lastFailure?.reason ?? null);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Voice provider status: ${label}`}
          className={cn("rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring", className)}
        >
          <Badge
            variant="outline"
            className={cn(
              "min-h-8 gap-1.5 font-medium",
              state === "ok" && "border-primary/50 text-primary",
              state === "warn" && "border-brand-secondary/50 text-brand-secondary",
              state === "blocked" && "border-destructive/50 text-destructive",
            )}
          >
            {loading ? (
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
            ) : state === "ok" ? (
              <ShieldCheck className="h-3 w-3" aria-hidden="true" />
            ) : (
              <ShieldAlert className="h-3 w-3" aria-hidden="true" />
            )}
            {label}
          </Badge>
        </button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-80 space-y-3 text-sm">
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-2 font-display font-semibold text-foreground">
            <AudioLines className="h-4 w-4 text-brand-secondary" aria-hidden="true" />
            Interviewer voice
          </p>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => void load()} aria-label="Refresh voice status">
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} aria-hidden="true" />
          </Button>
        </div>

        <dl className="space-y-1.5 text-xs">
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Service credential</dt>
            <dd className="font-medium">{health?.configured ? "Configured" : "Missing"}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Plan entitlement</dt>
            <dd className="font-medium">
              {health?.entitled ? `Included (${health.tier})` : `Not included (${health?.tier ?? "free"})`}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Last successful stream</dt>
            <dd className="font-medium">
              {health?.lastSuccessAt ? new Date(health.lastSuccessAt).toLocaleTimeString() : "—"}
            </dd>
          </div>
        </dl>

        {health?.lastFailure ? (
          <div className="rounded-lg border border-border/60 bg-muted/40 p-3">
            <p className="text-xs font-semibold text-foreground">{reasonCopy?.label ?? "Last failure"}</p>
            <p className="mt-1 text-xs text-muted-foreground">{reasonCopy?.detail}</p>
            <p className="mt-2 font-mono text-[11px] text-muted-foreground">
              {[health.lastFailure.code, health.lastFailure.reason, health.lastFailure.upstreamStatus ? `HTTP ${health.lastFailure.upstreamStatus}` : null]
                .filter(Boolean)
                .join(" · ")}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {new Date(health.lastFailure.at).toLocaleString()}
            </p>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No voice failures recorded for this account.</p>
        )}
      </PopoverContent>
    </Popover>
  );
}
