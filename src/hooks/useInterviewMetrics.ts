import { useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { trackJourney } from "@/lib/telemetry/journey";

/**
 * Records realtime interview quality signals (dropouts, barge-ins, latency,
 * minutes used) for a single session, and mirrors the headline numbers into
 * product analytics. All writes are best-effort: metrics must never break a
 * live interview.
 */
export interface InterviewMetricsSeed {
  sessionId?: string | null;
  provider?: "gemini_live" | "fallback";
  targetRole?: string | null;
}

interface Counters {
  bargeIns: number;
  interruptions: number;
  dropouts: number;
  reconnects: number;
  turns: number;
  latencies: number[];
  firstTokenLatency: number | null;
}

function emptyCounters(): Counters {
  return {
    bargeIns: 0,
    interruptions: 0,
    dropouts: 0,
    reconnects: 0,
    turns: 0,
    latencies: [],
    firstTokenLatency: null,
  };
}

function percentile(values: number[], p: number) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return Math.round(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]);
}

export function useInterviewMetrics() {
  const rowId = useRef<string | null>(null);
  const startedAt = useRef<number>(0);
  const turnStartedAt = useRef<number | null>(null);
  const counters = useRef<Counters>(emptyCounters());
  const seed = useRef<InterviewMetricsSeed>({});

  const begin = useCallback(async (input: InterviewMetricsSeed = {}) => {
    counters.current = emptyCounters();
    startedAt.current = Date.now();
    seed.current = input;
    rowId.current = null;

    trackJourney("realtime_session_started", {
      provider: input.provider ?? "gemini_live",
      has_role: Boolean(input.targetRole),
    });

    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return;

    const { data, error } = await supabase
      .from("interview_session_metrics")
      .insert({
        user_id: auth.user.id,
        session_id: input.sessionId ?? null,
        provider: input.provider ?? "gemini_live",
        target_role: input.targetRole ?? null,
      })
      .select("id")
      .single();

    if (!error) rowId.current = data.id;
  }, []);

  /** Called when the user starts speaking — used for barge-in and latency. */
  const markUserTurnStart = useCallback(() => {
    turnStartedAt.current = Date.now();
  }, []);

  const markBargeIn = useCallback(() => {
    counters.current.bargeIns += 1;
  }, []);

  const markInterruption = useCallback(() => {
    counters.current.interruptions += 1;
  }, []);

  const markModelResponse = useCallback(() => {
    counters.current.turns += 1;
    if (turnStartedAt.current) {
      const latency = Date.now() - turnStartedAt.current;
      counters.current.latencies.push(latency);
      counters.current.firstTokenLatency ??= latency;
      turnStartedAt.current = null;
    }
  }, []);

  const markDropout = useCallback((reason?: string) => {
    counters.current.dropouts += 1;
    trackJourney("realtime_dropout", { reason: reason?.slice(0, 60) ?? "unknown" });
  }, []);

  const markReconnect = useCallback(() => {
    counters.current.reconnects += 1;
    trackJourney("realtime_reconnected", { attempt: counters.current.reconnects });
  }, []);

  const markFallback = useCallback((reason?: string) => {
    trackJourney("realtime_fallback_engaged", { reason: reason?.slice(0, 60) ?? "unknown" });
  }, []);

  const finish = useCallback(async (endReason: string) => {
    if (!startedAt.current) return null;
    const durationSec = Math.round((Date.now() - startedAt.current) / 1000);
    const c = counters.current;
    const summary = {
      duration_sec: durationSec,
      minutes_used: Number((durationSec / 60).toFixed(2)),
      barge_in_count: c.bargeIns,
      interruption_count: c.interruptions,
      dropout_count: c.dropouts,
      reconnect_count: c.reconnects,
      turn_count: c.turns,
      first_token_latency_ms: c.firstTokenLatency,
      avg_latency_ms: c.latencies.length
        ? Math.round(c.latencies.reduce((a, b) => a + b, 0) / c.latencies.length)
        : null,
      p95_latency_ms: percentile(c.latencies, 0.95),
      end_reason: endReason,
      ended_at: new Date().toISOString(),
    };

    trackJourney("realtime_session_ended", {
      end_reason: endReason,
      duration_sec: durationSec,
      dropouts: c.dropouts,
      reconnects: c.reconnects,
      turns: c.turns,
      avg_latency_ms: summary.avg_latency_ms,
    });

    if (rowId.current) {
      await supabase.from("interview_session_metrics").update(summary).eq("id", rowId.current);
    }
    startedAt.current = 0;
    return summary;
  }, []);

  /** Attaches the interview session id once the report row exists. */
  const linkSession = useCallback(async (sessionId: string) => {
    if (!rowId.current) return;
    await supabase.from("interview_session_metrics").update({ session_id: sessionId }).eq("id", rowId.current);
  }, []);

  const elapsedSec = useCallback(
    () => (startedAt.current ? Math.round((Date.now() - startedAt.current) / 1000) : 0),
    [],
  );

  return {
    begin,
    finish,
    linkSession,
    elapsedSec,
    markUserTurnStart,
    markBargeIn,
    markInterruption,
    markModelResponse,
    markDropout,
    markReconnect,
    markFallback,
  };
}
