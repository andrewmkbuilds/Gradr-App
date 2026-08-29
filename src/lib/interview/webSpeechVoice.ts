/**
 * Web Speech API fallback voice.
 *
 * Strictly a safety net: the interviewer normally speaks through Deepgram
 * (see the `interview-speech` backend). When that pipeline can't produce audio
 * — provider outage, network failure, unusable response — the same sentence is
 * spoken here so the interview keeps moving instead of going silent.
 *
 * Browsers differ wildly in what voices exist and when they load, so this
 * module is defensive: it waits for the async voice list, scores what it finds,
 * skips novelty voices, and reports honestly when nothing usable exists.
 */

export interface WebSpeechHandle {
  /** Resolves when the utterance finishes; rejects only on a real failure. */
  done: Promise<void>;
  /** Immediate silence — used for barge-in, turn end and unmount. */
  cancel: () => void;
}

/** Voices that are jokes, effects, or plainly wrong for an interview. */
const NOVELTY = /(albert|bad news|bahh|bells|boing|bubbles|cellos|deranged|good news|jester|junior|organ|superstar|trinoids|whisper|wobble|zarvox|pipe organ|hysterical)/i;

/** Higher is better. Natural/neural voices first, then quality en-US voices. */
function scoreVoice(v: SpeechSynthesisVoice): number {
  const name = v.name.toLowerCase();
  if (NOVELTY.test(name)) return -1;
  let score = 0;
  if (/^en([-_]|$)/i.test(v.lang)) score += 40;
  if (/^en[-_]us/i.test(v.lang)) score += 15;
  if (name.includes("natural")) score += 40;
  if (name.includes("neural")) score += 35;
  if (name.includes("google")) score += 25;
  if (name.includes("microsoft")) score += 18;
  if (name.includes("samantha") || name.includes("aaron") || name.includes("daniel")) score += 12;
  if (v.localService) score += 4;
  if (v.default) score += 2;
  return score;
}

export function speechSynthesisSupported(): boolean {
  return typeof window !== "undefined" &&
    "speechSynthesis" in window &&
    typeof window.SpeechSynthesisUtterance === "function";
}

/**
 * Resolves the voice list. Chrome populates it asynchronously and fires
 * `voiceschanged`; Safari populates it lazily on the first `getVoices()` call.
 */
export function loadVoices(timeoutMs = 1500): Promise<SpeechSynthesisVoice[]> {
  if (!speechSynthesisSupported()) return Promise.resolve([]);
  const synth = window.speechSynthesis;
  const immediate = synth.getVoices();
  if (immediate.length) return Promise.resolve(immediate);

  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      synth.removeEventListener("voiceschanged", finish);
      window.clearTimeout(timer);
      resolve(synth.getVoices());
    };
    const timer = window.setTimeout(finish, timeoutMs);
    synth.addEventListener("voiceschanged", finish);
  });
}

/**
 * Persona-aware voice engine.
 *
 * The same instance is reused for a whole session so the fallback voice stays
 * consistent between sentences instead of drifting per utterance.
 */
export class WebSpeechVoice {
  private voice: SpeechSynthesisVoice | null = null;
  private resolved: Promise<SpeechSynthesisVoice | null> | null = null;
  private current: SpeechSynthesisUtterance | null = null;

  constructor(private rate = 1, private pitch = 1) {}

  get supported() {
    return speechSynthesisSupported();
  }

  /** Best available voice, or null when the device has nothing usable. */
  async pickVoice(): Promise<SpeechSynthesisVoice | null> {
    if (this.voice) return this.voice;
    if (!this.resolved) {
      this.resolved = loadVoices().then((voices) => {
        const usable = voices
          .map((v) => ({ v, score: scoreVoice(v) }))
          .filter((c) => c.score >= 0)
          .sort((a, b) => b.score - a.score);
        this.voice = usable[0]?.v ?? null;
        if (!this.voice) console.warn("[voice] no usable speech synthesis voice on this device");
        return this.voice;
      });
    }
    return this.resolved;
  }

  /**
   * Speaks one sentence. Resolves when it finishes, rejects when the browser
   * cannot speak it at all — never on a cancel, which is a normal barge-in.
   */
  speak(text: string): WebSpeechHandle {
    if (!this.supported || !text.trim()) {
      return { done: Promise.reject(new Error("VOICE_UNAVAILABLE")), cancel: () => {} };
    }
    const synth = window.speechSynthesis;
    let cancelled = false;

    const done = (async () => {
      const voice = await this.pickVoice();
      if (!voice) throw new Error("VOICE_UNAVAILABLE");
      if (cancelled) return;

      await new Promise<void>((resolve, reject) => {
        // A stale utterance queued behind ours would speak over the next turn.
        synth.cancel();
        const utter = new SpeechSynthesisUtterance(text);
        utter.voice = voice;
        utter.lang = voice.lang || "en-US";
        utter.rate = this.rate;
        utter.pitch = this.pitch;
        utter.onend = () => {
          this.current = null;
          resolve();
        };
        utter.onerror = (e) => {
          this.current = null;
          // "interrupted"/"canceled" are our own barge-in, not a failure.
          if (cancelled || e.error === "interrupted" || e.error === "canceled") resolve();
          else reject(new Error("VOICE_UNAVAILABLE"));
        };
        this.current = utter;
        synth.speak(utter);
      });
    })();

    return {
      done,
      cancel: () => {
        cancelled = true;
        this.current = null;
        try {
          synth.cancel();
        } catch {
          /* nothing to cancel */
        }
      },
    };
  }

  stop() {
    if (!this.supported) return;
    this.current = null;
    try {
      window.speechSynthesis.cancel();
    } catch {
      /* nothing to cancel */
    }
  }
}
