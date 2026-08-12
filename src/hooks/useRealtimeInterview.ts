import { useCallback, useEffect, useRef, useState } from "react";
import { invokeFunction } from "@/lib/invokeFunction";
import { supabase } from "@/integrations/supabase/client";
import { getPaddleEnvironment } from "@/lib/paddle";
import { GeminiLiveSession, type LiveStatus } from "@/lib/interview/geminiLive";

export interface RealtimeLimits {
  tier: "free" | "starter" | "pro";
  realtimeVoice: boolean;
  maxSessionMinutes: number;
  sessionsPerMonth: number | null;
  sessionsUsed: number;
  sessionsRemaining: number | null;
  premiumVoiceFallback: boolean;
}

export interface RealtimeTurn {
  role: "user" | "assistant";
  content: string;
}

interface StartArgs {
  directive: string;
  personaId: string;
  difficultyId: string;
  voiceName?: string;
  /** Existing transcript replayed to the model when recovering a dropped session. */
  resumeTranscript?: RealtimeTurn[];
}

export interface RealtimeCallbacks {
  /** A completed turn (either side) is appended to the shared transcript. */
  onTurn?: (turn: RealtimeTurn) => void;
  /** Realtime became unusable — caller should switch to the fallback engine. */
  onFallback?: (reason: string) => void;
}

/**
 * Drives the Gemini Live realtime interview: entitlement-checked session start,
 * live transcripts, barge-in, and a clean hand-off to the fallback engine when
 * the realtime link fails.
 */
export function useRealtimeInterview(cb: RealtimeCallbacks = {}) {
  const [status, setStatus] = useState<LiveStatus>("idle");
  const [limits, setLimits] = useState<RealtimeLimits | null>(null);
  const [blockedReason, setBlockedReason] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [listening, setListening] = useState(false);
  const [partialUser, setPartialUser] = useState("");
  const [partialModel, setPartialModel] = useState("");
  const [muted, setMutedState] = useState(false);

  const sessionRef = useRef<GeminiLiveSession | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cbRef = useRef(cb);
  cbRef.current = cb;

  const cleanup = useCallback(() => {
    sessionRef.current?.close();
    sessionRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setSpeaking(false);
    setListening(false);
    setPartialUser("");
    setPartialModel("");
  }, []);

  useEffect(() => cleanup, [cleanup]);

  /** Checks entitlement and mints an ephemeral token without opening a session. */
  const preflightEntitlement = useCallback(async (args: StartArgs) => {
    const { data, error } = await invokeFunction("interview-realtime-token", {
      body: {
        environment: getPaddleEnvironment(),
        reconnect: (args.resumeTranscript?.length ?? 0) > 0,
        directive: args.directive,
        personaId: args.personaId,
        difficultyId: args.difficultyId,
        voiceName: args.voiceName ?? "Puck",
        resumeTranscript: args.resumeTranscript ?? [],
      },
    });

    if (error) {
      // Edge function errors carry the real reason in the response body.
      let payload: any = null;
      try {
        payload = await (error as any)?.context?.json?.();
      } catch {
        /* body already consumed or not JSON */
      }
      if (payload?.limits) setLimits(payload.limits as RealtimeLimits);
      const reason = payload?.reason ?? "Realtime voice isn't available right now.";
      setBlockedReason(reason);
      return { ok: false as const, reason, code: payload?.error ?? "unknown" };
    }

    if (data?.limits) setLimits(data.limits as RealtimeLimits);
    if (!data?.token) {
      const reason = data?.reason ?? "Realtime voice isn't available right now.";
      setBlockedReason(reason);
      return { ok: false as const, reason, code: data?.error ?? "unknown" };
    }
    setBlockedReason(null);
    return { ok: true as const, token: data.token as string, model: data.model as string };
  }, []);

  const start = useCallback(
    async (args: StartArgs) => {
      cleanup();
      setStatus("connecting");

      const gate = await preflightEntitlement(args);
      if (!gate.ok) {
        setStatus("idle");
        cbRef.current.onFallback?.(gate.reason);
        return { ok: false as const, reason: gate.reason, code: gate.code };
      }

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
      } catch {
        const reason = "Microphone access is required for the realtime interview.";
        setStatus("error");
        setBlockedReason(reason);
        return { ok: false as const, reason, code: "mic_denied" };
      }
      streamRef.current = stream;

      const session = new GeminiLiveSession({
        onStatus: (s, detail) => {
          setStatus(s);
          if (s === "error" && detail) setBlockedReason(detail);
        },
        onUserTranscript: (text, final) => {
          if (final) {
            setPartialUser("");
            cbRef.current.onTurn?.({ role: "user", content: text });
          } else {
            setPartialUser(text);
          }
        },
        onModelTranscript: (text, final) => {
          if (final) {
            setPartialModel("");
            cbRef.current.onTurn?.({ role: "assistant", content: text });
          } else {
            setPartialModel(text);
          }
        },
        onSpeakingChange: setSpeaking,
        onListeningChange: setListening,
        onInterrupted: () => setPartialModel(""),
        onError: (message) => {
          // Preserve the transcript and let the caller swap engines.
          cbRef.current.onFallback?.(message);
        },
      });
      sessionRef.current = session;

      try {
        await session.connect(gate.token, gate.model, stream);
        setStatus("live");
        return { ok: true as const };
      } catch (e: any) {
        cleanup();
        const reason = e?.message ?? "Couldn't open the realtime voice connection.";
        setStatus("error");
        setBlockedReason(reason);
        cbRef.current.onFallback?.(reason);
        return { ok: false as const, reason, code: "connect_failed" };
      }
    },
    [cleanup, preflightEntitlement],
  );

  const stop = useCallback(() => {
    cleanup();
    setStatus("closed");
  }, [cleanup]);

  const interrupt = useCallback(() => sessionRef.current?.interrupt(), []);
  const sendText = useCallback((text: string) => sessionRef.current?.sendText(text), []);
  const setMuted = useCallback((next: boolean) => {
    sessionRef.current?.setMuted(next);
    setMutedState(next);
  }, []);

  return {
    status,
    isLive: status === "live",
    limits,
    blockedReason,
    speaking,
    listening,
    muted,
    partialUser,
    partialModel,
    start,
    stop,
    interrupt,
    sendText,
    setMuted,
    preflightEntitlement,
  };
}
