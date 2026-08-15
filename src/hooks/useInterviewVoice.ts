import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getPaddleEnvironment } from "@/lib/paddle";
import { SentenceChunker, SpeechQueue, TimedReveal, cleanForSpeech, estimatedSpeechMs, type AudioResult } from "@/lib/interview/speechStream";
import { VOICE_ABORTED, toVoiceErrorCode, toVoiceProviderReason, type VoiceErrorCode, type VoiceProviderReason } from "@/lib/interview/voiceErrors";
import { voiceProfileFor } from "@/lib/interview/voiceProfiles";

/**
 * The interviewer's voice.
 *
 * Consumes the reasoning model's text stream and speaks it through Gradr's
 * voice backend chunk by chunk, revealing the transcript only as each thought
 * is actually spoken. The provider lives entirely behind that backend: this
 * hook only ever sees sanitized Gradr voice error codes.
 */

const SPEECH_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/interview-speech`;
const FETCH_TIMEOUT_MS = 25_000;

export interface UseInterviewVoiceOptions {
  /** Persona drives voice, pacing and the length of natural pauses. */
  personaId: string;
  /** Speech is skipped entirely when voice is off (transcript still streams). */
  enabled: boolean;
  /**
   * Live caption for the current interviewer turn: everything spoken so far,
   * revealed word by word in sync with the audio. Never runs ahead of the voice.
   */
  onCaption: (fullText: string) => void;
  /** The interviewer finished the whole turn. */
  onTurnComplete: () => void;
  /** Voice failed mid-turn — the turn was aborted. Sanitized Gradr code only. */
  onVoiceError: (code: VoiceErrorCode) => void;
}

export function useInterviewVoice(opts: UseInterviewVoiceOptions) {
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState<VoiceErrorCode | null>(null);
  /** Enumerated provider reason for the last failure — safe to display. */
  const [errorReason, setErrorReason] = useState<VoiceProviderReason | null>(null);
  const reasonRef = useRef<VoiceProviderReason | null>(null);
  /** Backend request id for the failing turn — quoted to support for lookup. */
  const [errorRequestId, setErrorRequestId] = useState<string | null>(null);
  const requestIdRef = useRef<string | null>(null);


  const optsRef = useRef(opts);
  optsRef.current = opts;

  const queueRef = useRef<SpeechQueue | null>(null);
  const chunkerRef = useRef(new SentenceChunker());
  const spokenRef = useRef("");
  /** Chunks already fully spoken this turn — the finalized part of the caption. */
  const finalizedRef = useRef("");
  /** Paced (voice-off) reveal state. */
  const pacedRef = useRef<{ reveal: TimedReveal | null; queue: string[]; running: boolean; ended: boolean }>({
    reveal: null,
    queue: [],
    running: false,
    ended: false,
  });

  const emitCaption = useCallback((partial: string) => {
    const full = `${finalizedRef.current} ${partial}`.trim();
    optsRef.current.onCaption(full);
  }, []);

  /** Voice off: still reveal word by word, at a natural speaking pace. */
  const pumpPaced = useCallback(() => {
    const state = pacedRef.current;
    if (state.running) return;
    const next = state.queue.shift();
    if (!next) {
      if (state.ended) {
        state.ended = false;
        optsRef.current.onTurnComplete();
      }
      return;
    }
    state.running = true;
    const reveal = new TimedReveal(next, (revealed) => emitCaption(revealed));
    state.reveal = reveal;
    reveal.startPaced();
    window.setTimeout(() => {
      reveal.finish();
      finalizedRef.current = `${finalizedRef.current} ${next}`.trim();
      spokenRef.current = finalizedRef.current;
      emitCaption("");
      state.running = false;
      state.reveal = null;
      pumpPaced();
    }, estimatedSpeechMs(next) + 120);
  }, [emitCaption]);

  const queuePaced = useCallback((text: string) => {
    const clean = cleanForSpeech(text);
    if (!clean) return;
    pacedRef.current.queue.push(clean);
    pumpPaced();
  }, [pumpPaced]);

  const stopPaced = useCallback(() => {
    pacedRef.current.reveal?.cancel();
    pacedRef.current = { reveal: null, queue: [], running: false, ended: false };
  }, []);

  /** One authenticated backend voice call per spoken thought. */
  const fetchAudio = useCallback(async (text: string, signal: AbortSignal): Promise<AudioResult> => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return { error: "VOICE_SESSION_EXPIRED" };

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
          environment: getPaddleEnvironment(),
          previousText: spokenRef.current.slice(-400),
        }),
      });

      if (!res.ok) {
        // The backend only ever returns sanitized Gradr codes.
        const payload = await res.json().catch(() => ({} as Record<string, unknown>));
        const code = toVoiceErrorCode(payload?.code);
        reasonRef.current = toVoiceProviderReason(payload?.reason);
        requestIdRef.current = typeof payload?.requestId === "string" ? payload.requestId : null;
        console.error("[voice] request failed", {
          status: res.status,
          code,
          reason: reasonRef.current,
          requestId: requestIdRef.current,
        });
        return { error: code };
      }

      const blob = await res.blob();
      if (!blob.size) {
        console.error("[voice] empty audio response");
        return { error: "VOICE_UNAVAILABLE" };
      }
      return { blob };
    } catch (e: any) {
      if (signal.aborted) return { error: VOICE_ABORTED };
      const code: VoiceErrorCode = e?.name === "AbortError" ? "VOICE_TIMEOUT" : "VOICE_CONNECTION_FAILED";
      console.error("[voice] request error", code);
      return { error: code };
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
      onChunkStart: () => {
        // New thought: the caption starts empty and fills in as it is spoken.
        emitCaption("");
      },
      onChunkReveal: (revealed) => emitCaption(revealed),
      onChunkSpoken: (text) => {
        finalizedRef.current = `${finalizedRef.current} ${text}`.trim();
        spokenRef.current = finalizedRef.current;
        emitCaption("");
      },
      onSpeakingChange: setSpeaking,
      onDrained: () => optsRef.current.onTurnComplete(),
      onFailure: (code) => {
        console.error("[voice] turn aborted:", code);
        setError(code);
        setErrorReason(reasonRef.current);
        setErrorRequestId(requestIdRef.current);
        setSpeaking(false);
        optsRef.current.onVoiceError(code);
      },

    });
    queueRef.current = q;
    return q;
  }, [fetchAudio, emitCaption]);

  /** Opens a new interviewer turn. */
  const beginTurn = useCallback(() => {
    console.info("[voice] starting turn — persona:", optsRef.current.personaId);
    chunkerRef.current = new SentenceChunker();
    spokenRef.current = "";
    finalizedRef.current = "";
    stopPaced();
    optsRef.current.onCaption("");
    setError(null);
    setErrorReason(null);
    setErrorRequestId(null);
    reasonRef.current = null;
    requestIdRef.current = null;
    const q = ensureQueue();
    q.reset();
  }, [ensureQueue, stopPaced]);


  /** Feeds a model delta; complete thoughts are queued for speech. */
  const pushDelta = useCallback((delta: string) => {
    const chunks = chunkerRef.current.push(delta);
    if (!chunks.length) return;
    if (!optsRef.current.enabled) {
      // Voice off: reveal word by word at a natural reading/speaking pace.
      chunks.forEach(queuePaced);
      return;
    }
    const q = ensureQueue();
    chunks.forEach((c) => q.push(c));
  }, [ensureQueue, queuePaced]);

  /** No more deltas — flush the tail and let playback finish. */
  const endTurn = useCallback(() => {
    const tail = chunkerRef.current.flush();
    if (!optsRef.current.enabled) {
      tail.forEach(queuePaced);
      pacedRef.current.ended = true;
      pumpPaced();
      return;
    }
    const q = ensureQueue();
    tail.forEach((c) => q.push(c));
    q.end();
  }, [ensureQueue, queuePaced, pumpPaced]);

  /** Barge-in / end of session: silence the interviewer immediately. */
  const stop = useCallback(() => {
    queueRef.current?.stop();
    stopPaced();
    setSpeaking(false);
  }, [stopPaced]);

  /** Replays already-generated interviewer text without making another AI call. */
  const retryTurn = useCallback((text: string) => {
    beginTurn();
    pushDelta(text);
    endTurn();
  }, [beginTurn, endTurn, pushDelta]);

  useEffect(() => () => {
    pacedRef.current.reveal?.cancel();
    queueRef.current?.stop();
    queueRef.current = null;
  }, []);

  return {
    speaking,
    error,
    errorReason,
    errorRequestId,
    clearError: () => {
      setError(null);
      setErrorReason(null);
      setErrorRequestId(null);
      reasonRef.current = null;
      requestIdRef.current = null;
    },
    beginTurn, pushDelta, endTurn, retryTurn, stop };
}
