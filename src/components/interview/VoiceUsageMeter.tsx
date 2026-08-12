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

/**
 * Realtime voice usage for the current billing month: minutes spoken, sessions
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

  const minutePct = useMemo(
    () => Math.min(100, Math.round((minutes / maxMinutes) * 100)),
    [minutes, maxMinutes],
  );
  const sessionPct = useMemo(() => {
    if (!sessions?.allowance) return 0;
    return Math.min(100, Math.round((sessions.used / sessions.allowance) * 100));
  }, [sessions]);

  const nearLimit = minutePct >= 80 || sessionPct >= 80;

  return (
    <Card className={`glass-panel space-y-4 ${compact ? "p-4" : "p-5"}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Mic className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Realtime voice</h3>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={nearLimit ? "destructive" : "secondary"} className="text-[10px] capitalize">
            {tier}
          </Badge>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger aria-label="How voice limits work">
                <Info className="h-3.5 w-3.5 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent className="max-w-64 text-xs">
                Voice minutes and sessions reset on the 1st of each month. When you run out, interviews keep
                working on the text coach with premium voice playback — you just lose live streaming.
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">Voice minutes</span>
          <span className="font-medium tabular-nums">
            {minutes.toFixed(1)} / {maxMinutes}
          </span>
        </div>
        <Progress value={minutePct} className="h-1.5" />
      </div>

      <div className="space-y-1.5">
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">Interview sessions</span>
          <span className="font-medium tabular-nums">
            {sessions?.allowance == null
              ? `${sessions?.used ?? 0} / unlimited`
              : `${sessions.used} / ${sessions.allowance}`}
          </span>
        </div>
        <Progress value={sessionPct} className="h-1.5" />
      </div>

      {nearLimit && (
        <p className="text-xs text-muted-foreground">
          You're close to this month's limit. Sessions past the limit fall back to the text coach.
        </p>
      )}
    </Card>
  );
}
