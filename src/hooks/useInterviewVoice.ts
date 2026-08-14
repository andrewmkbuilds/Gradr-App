import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SentenceChunker, SpeechQueue } from "@/lib/interview/speechStream";
import { voiceProfileFor } from "@/lib/interview/voiceProfiles";

/**
 * The interviewer's voice.
 *
 * Consumes the reasoning model's text stream and speaks it through ElevenLabs
 * chunk by chunk, revealing the transcript only as each thought is actually
 * spoken. Degrades to browser speech synthesis if ElevenLabs fails, and stops
 * instantly on barge-in, session end or unmount.
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
}

export function useInterviewVoice(opts: UseInterviewVoiceOptions) {
  const [speaking, setSpeaking] = useState(false);
  const [degraded, setDegraded] = useState(false);

  const optsRef = useRef(opts);
  optsRef.current = opts;

  const queueRef = useRef<SpeechQueue | null>(null);
  const chunkerRef = useRef(new SentenceChunker());
  const spokenRef = useRef("");

  /** One authenticated ElevenLabs call per spoken thought. */
  const fetchAudio = useCallback(async (text: string, signal: AbortSignal): Promise<Blob | null> => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return null;

    const timeout = window.setTimeout(() => {
      // Abort only this chunk; the rest of the turn continues.
      try { (signal as any).dispatchEvent?.(new Event("abort")); } catch { /* noop */ }
    }, FETCH_TIMEOUT_MS);

    try {
      const res = await fetch(SPEECH_URL, {
        method: "POST",
        signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({
          text,
          personaId: optsRef.current.personaId,
          previousText: spokenRef.current.slice(-400),
        }),
      });
      if (!res.ok) return null;
      const blob = await res.blob();
      return blob.size > 0 ? blob : null;
    } catch {
      return null;
    } finally {
      window.clearTimeout(timeout);
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
      onDegraded: () => setDegraded(true),
    });
    queueRef.current = q;
    return q;
  }, [fetchAudio]);

  /** Opens a new interviewer turn. */
  const beginTurn = useCallback(() => {
    chunkerRef.current = new SentenceChunker();
    spokenRef.current = "";
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

  useEffect(() => () => {
    queueRef.current?.stop();
    queueRef.current = null;
  }, []);

  return { speaking, degraded, beginTurn, pushDelta, endTurn, stop };
}
