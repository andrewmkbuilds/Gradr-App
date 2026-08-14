import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SentenceChunker, SpeechQueue, type AudioResult } from "@/lib/interview/speechStream";
import { voiceProfileFor } from "@/lib/interview/voiceProfiles";

/**
 * The interviewer's voice.
 *
 * Consumes the reasoning model's text stream and speaks it through ElevenLabs
 * chunk by chunk, revealing the transcript only as each thought is actually
 * spoken. There is no substitute voice engine: if ElevenLabs fails the turn
 * stops and `error` is set so the studio can offer an explicit retry.
 */

const SPEECH_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/interview-speech`;
const FETCH_TIMEOUT_MS = 25_000;

export interface UseInterviewVoiceOptions {
  /** Persona drives voice, pacing and the length of natural pauses. */
  personaId: string;
  /** Speech is skipped entirely when voice is off (transcript still streams). */
  enabled: boolean;
  /** Fired as each thought starts being spoken — drives the live caption. */
  onSpokenChunk: (text: string) => void;
  /** The interviewer finished the whole turn. */
  onTurnComplete: () => void;
  /** ElevenLabs failed mid-turn — the turn was aborted. */
  onVoiceError: (reason: string) => void;
}

export function useInterviewVoice(opts: UseInterviewVoiceOptions) {
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);


  const optsRef = useRef(opts);
  optsRef.current = opts;

  const queueRef = useRef<SpeechQueue | null>(null);
  const chunkerRef = useRef(new SentenceChunker());
  const spokenRef = useRef("");

  /** One authenticated ElevenLabs call per spoken thought. */
  const fetchAudio = useCallback(async (text: string, signal: AbortSignal): Promise<AudioResult> => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return { error: "You've been signed out. Sign in again to continue." };

    // Own controller so a slow chunk times out without killing the whole turn,
    // while still honouring the caller's abort (barge-in / session end).
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const relay = () => controller.abort();
    if (signal.aborted) controller.abort();
    else signal.addEventListener("abort", relay, { once: true });

    try {
      const res = await fetch(SPEECH_URL, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({
          text,
          personaId: optsRef.current.personaId,
          environment: import.meta.env.VITE_PAYMENTS_ENVIRONMENT === "live" ? "live" : "sandbox",
          previousText: spokenRef.current.slice(-400),
        }),
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => ({} as any));
        const reason = payload?.message || payload?.reason || payload?.error || `HTTP ${res.status}`;
        console.error("[ElevenLabs] Audio stream: failed", { status: res.status, reason });
        return { error: String(reason) };
      }

      const blob = await res.blob();
      if (!blob.size) {
        console.error("[ElevenLabs] Audio stream: empty response");
        return { error: "ElevenLabs returned no audio." };
      }
      return { blob };
    } catch (e: any) {
      if (signal.aborted) return { error: "aborted" };
      const reason = e?.name === "AbortError" ? "The voice request timed out." : String(e?.message ?? e);
      console.error("[ElevenLabs] Audio stream: failed", reason);
      return { error: reason };
    } finally {
      window.clearTimeout(timeout);
      signal.removeEventListener("abort", relay);
    }
  }, []);



  const ensureQueue = useCallback(() => {
    if (queueRef.current) return queueRef.current;
    const profile = voiceProfileFor(optsRef.current.personaId);
    const q = new SpeechQueue({
      fetchAudio,
      beatMs: profile.beatMs,
      onChunkSpoken: (text) => {
        spokenRef.current = `${spokenRef.current} ${text}`.trim();
        optsRef.current.onSpokenChunk(text);
      },
      onSpeakingChange: setSpeaking,
      onDrained: () => optsRef.current.onTurnComplete(),
      onFailure: (reason) => {
        console.error("[ElevenLabs] Turn aborted:", reason);
        setError(reason);
        setSpeaking(false);
        optsRef.current.onVoiceError(reason);
      },

    });
    queueRef.current = q;
    return q;
  }, [fetchAudio]);

  /** Opens a new interviewer turn. */
  const beginTurn = useCallback(() => {
    console.info("[ElevenLabs] Initializing voice turn — persona:", optsRef.current.personaId);
    chunkerRef.current = new SentenceChunker();
    spokenRef.current = "";
    setError(null);
    const q = ensureQueue();
    q.reset();
  }, [ensureQueue]);


  /** Feeds a model delta; complete thoughts are queued for speech. */
  const pushDelta = useCallback((delta: string) => {
    const chunks = chunkerRef.current.push(delta);
    if (!chunks.length) return;
    if (!optsRef.current.enabled) {
      // Voice off: reveal the transcript at the same thought cadence.
      chunks.forEach((c) => optsRef.current.onSpokenChunk(c));
      return;
    }
    const q = ensureQueue();
    chunks.forEach((c) => q.push(c));
  }, [ensureQueue]);

  /** No more deltas — flush the tail and let playback finish. */
  const endTurn = useCallback(() => {
    const tail = chunkerRef.current.flush();
    if (!optsRef.current.enabled) {
      tail.forEach((c) => optsRef.current.onSpokenChunk(c));
      optsRef.current.onTurnComplete();
      return;
    }
    const q = ensureQueue();
    tail.forEach((c) => q.push(c));
    q.end();
  }, [ensureQueue]);

  /** Barge-in / end of session: silence the interviewer immediately. */
  const stop = useCallback(() => {
    queueRef.current?.stop();
    setSpeaking(false);
  }, []);

  /** Replays already-generated interviewer text without making another AI call. */
  const retryTurn = useCallback((text: string) => {
    beginTurn();
    pushDelta(text);
    endTurn();
  }, [beginTurn, endTurn, pushDelta]);

  useEffect(() => () => {
    queueRef.current?.stop();
    queueRef.current = null;
  }, []);

  return { speaking, error, clearError: () => setError(null), beginTurn, pushDelta, endTurn, retryTurn, stop };
}
