import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Mic, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useEntitlements } from "@/hooks/useSubscription";
import { Progress } from "@/components/ui/progress";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const MAX_MINUTES_BY_TIER: Record<string, number> = { free: 10, starter: 60, pro: 240, advanced: 240 };

function monthStart() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
}

function nextReset() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 1);
}

function DetailRow({ term, value }: { term: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-muted-foreground">{term}</dt>
      <dd className="tabular-nums text-foreground">{value}</dd>
    </div>
  );
}

/**
 * Studio voice usage for the current billing month: minutes spoken, sessions
 * used against the plan allowance, and what happens when the limit is hit.
 */
export function VoiceUsageMeter({ compact = false }: { compact?: boolean }) {
  const { user } = useAuth();
  const { data: entitlements } = useEntitlements();

  const { data: minutes = 0 } = useQuery({
    queryKey: ["voice-minutes", user?.id],
    enabled: Boolean(user),
    staleTime: 30_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("interview_session_metrics")
        .select("minutes_used")
        .eq("user_id", user!.id)
        .gte("started_at", monthStart());
      return (data ?? []).reduce((sum, row) => sum + Number(row.minutes_used ?? 0), 0);
    },
  });

  const tier = entitlements?.tier ?? "free";
  const maxMinutes = MAX_MINUTES_BY_TIER[tier] ?? 10;
  const sessions = entitlements?.features.interview;
  const reset = nextReset();
  const resetLabel = reset.toLocaleString(undefined, {
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  const minutePct = useMemo(
    () => Math.min(100, Math.round((minutes / maxMinutes) * 100)),
    [minutes, maxMinutes],
  );
  const sessionPct = useMemo(() => {
    if (!sessions?.allowance) return 0;
    return Math.min(100, Math.round((sessions.used / sessions.allowance) * 100));
  }, [sessions]);

  const minuteOverage = Math.max(minutes - maxMinutes, 0);
  const sessionOverage = sessions?.allowance == null ? 0 : Math.max(sessions.used - sessions.allowance, 0);
  const nearLimit = minutePct >= 80 || sessionPct >= 80;

  return (
    <TooltipProvider delayDuration={150}>
      <Card className={`glass-panel space-y-4 ${compact ? "p-4" : "p-5"}`}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Mic className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Studio voice</h3>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={nearLimit ? "destructive" : "secondary"} className="text-[10px] capitalize">
              {tier}
            </Badge>
            <Tooltip>
              <TooltipTrigger aria-label="How voice limits work">
                <Info className="h-3.5 w-3.5 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent className="max-w-72 text-xs leading-relaxed">
                Voice minutes and interview sessions both reset on the calendar month — counters return to 0 at{" "}
                {resetLabel}, not on your billing anniversary. When you run out, interviews keep working on the
                text coach with premium voice playback — you just lose live streaming.
              </TooltipContent>
            </Tooltip>
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Voice minutes</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <span tabIndex={0} className="font-medium tabular-nums cursor-help rounded outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  {minutes.toFixed(1)} / {maxMinutes}
                </span>
              </TooltipTrigger>
              <TooltipContent className="max-w-72 text-xs leading-relaxed space-y-1">
                <p className="font-medium text-foreground">Live voice minutes</p>
                <dl className="space-y-0.5">
                  <DetailRow term="Used this month" value={`${minutes.toFixed(1)} min`} />
                  <DetailRow term="Plan allowance" value={`${maxMinutes} min on ${tier}`} />
                  <DetailRow term="Remaining" value={`${Math.max(maxMinutes - minutes, 0).toFixed(1)} min`} />
                  <DetailRow term="Overage" value={`${minuteOverage.toFixed(1)} min`} />
                </dl>
                <p className="text-muted-foreground pt-1 border-t border-border/60">
                  Measured from streamed session time and reset on the 1st of each month ({resetLabel}). Minutes
                  are not purchasable as credits — overage falls back to the text coach.
                </p>
              </TooltipContent>
            </Tooltip>
          </div>
          <Progress value={minutePct} className="h-1.5" />
        </div>

        <div className="space-y-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Interview sessions</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <span tabIndex={0} className="font-medium tabular-nums cursor-help rounded outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  {sessions?.allowance == null
                    ? `${sessions?.used ?? 0} / unlimited`
                    : `${sessions.used} / ${sessions.allowance}`}
                </span>
              </TooltipTrigger>
              <TooltipContent className="max-w-72 text-xs leading-relaxed space-y-1">
                <p className="font-medium text-foreground">Mock interview sessions</p>
                <dl className="space-y-0.5">
                  <DetailRow term="Used this month" value={String(sessions?.used ?? 0)} />
                  <DetailRow
                    term="Plan allowance"
                    value={sessions?.allowance == null ? "Unlimited" : `${sessions.allowance} / month`}
                  />
                  <DetailRow
                    term="Remaining"
                    value={sessions?.allowance == null ? "No cap" : String(Math.max(sessions.remaining ?? 0, 0))}
                  />
                  <DetailRow term="Overage runs" value={String(sessionOverage)} />
                </dl>
                <p className="text-muted-foreground pt-1 border-t border-border/60">
                  Calendar-month reset at {resetLabel}. Sessions past the allowance spend interview credits,
                  which carry over and never expire.
                </p>
              </TooltipContent>
            </Tooltip>
          </div>
          <Progress value={sessionPct} className="h-1.5" />
        </div>

        {nearLimit && (
          <p className="text-xs text-muted-foreground">
            You're close to this month's limit. Sessions past the limit fall back to the text coach.
          </p>
        )}
      </Card>
    </TooltipProvider>
  );
}
