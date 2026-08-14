import { VOICE_ABORTED, toVoiceErrorCode, type VoiceErrorCode } from "./voiceErrors";
/**
 * Interviewer speech pipeline.
 *
 * The reasoning model streams text; this module turns that stream into speech
 * that starts almost immediately and stays in step with the transcript:
 *
 *   model deltas -> SentenceChunker -> SpeechQueue -> Gradr voice backend -> playback
 *                                                  -> onChunkSpoken (transcript)
 *
 * Design notes
 * - Chunking at thought boundaries is what buys both low latency *and* natural
 *   pauses: each chunk is fetched while the previous one is still playing.
 * - The transcript only reveals a chunk when its audio actually starts, so the
 *   caption never runs ahead of the voice.
 * - There is deliberately NO silent fallback to another voice engine. If
 *   the voice backend fails, the turn stops and the caller surfaces a retryable error,
 *   so a broken integration can never hide behind a robotic substitute voice.
 */


const MAX_CHUNK_CHARS = 220;
const MIN_CHUNK_CHARS = 12;

/** Strips anything that would be read aloud as punctuation noise. */
export function cleanForSpeech(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[*_`#>]/g, "")
    .replace(/^\s*[-•]\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Accumulates streamed deltas and emits complete spoken thoughts. */
export class SentenceChunker {
  private buf = "";

  push(delta: string): string[] {
    this.buf += delta;
    const out: string[] = [];

    for (;;) {
      const cut = this.findCut();
      if (cut === -1) break;
      const piece = cleanForSpeech(this.buf.slice(0, cut));
      this.buf = this.buf.slice(cut);
      if (piece) out.push(piece);
    }
    return out;
  }

  flush(): string[] {
    const rest = cleanForSpeech(this.buf);
    this.buf = "";
    return rest ? [rest] : [];
  }

  /** Sentence end first; otherwise a clause break once the buffer runs long. */
  private findCut(): number {
    const m = /[.!?…]["')\]]?(\s|$)/.exec(this.buf);
    if (m && m.index + m[0].length >= MIN_CHUNK_CHARS) return m.index + m[0].length;

    if (this.buf.length > MAX_CHUNK_CHARS) {
      const window = this.buf.slice(0, MAX_CHUNK_CHARS);
      const comma = Math.max(window.lastIndexOf(", "), window.lastIndexOf("; "), window.lastIndexOf(" — "));
      if (comma > MIN_CHUNK_CHARS) return comma + 1;
      const space = window.lastIndexOf(" ");
      if (space > MIN_CHUNK_CHARS) return space + 1;
    }
    return -1;
  }
}

/** Natural silence after a thought, driven by how the thought ended. */
export function pauseAfter(text: string, beatMs: number): number {
  const last = text.trim().slice(-1);
  if (last === "?") return beatMs + 220;
  if (last === "." || last === "!" || last === "…") return beatMs + 80;
  if (last === "," || last === ";") return Math.round(beatMs * 0.45);
  return beatMs;
}

/**
 * Live-caption reveal layer.
 *
 * The AI response arrives in whole chunks, but a caption must never show text
 * the interviewer hasn't said yet. `TimedReveal` re-emits a chunk word by word,
 * either synced to the chunk's actual audio playback position, or — when voice
 * is off — at a natural speaking pace.
 */
export class TimedReveal {
  private words: string[];
  private shown = 0;
  private timer: number | null = null;
  private raf: number | null = null;
  private done = false;

  constructor(private text: string, private onReveal: (revealed: string) => void) {
    this.words = text.split(/\s+/).filter(Boolean);
  }

  private emit(count: number) {
    const next = Math.min(this.words.length, Math.max(this.shown, count));
    if (next === this.shown) return;
    this.shown = next;
    this.onReveal(this.words.slice(0, next).join(" "));
  }

  /** Syncs the caption to an audio element's playback position. */
  syncTo(audio: HTMLAudioElement) {
    this.cancel();
    const started = Date.now();
    const tick = () => {
      if (this.done) return;
      const duration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0;
      // Before metadata lands, fall back to an estimated speaking pace so the
      // caption still moves instead of sitting empty.
      const progress = duration
        ? audio.currentTime / duration
        : (Date.now() - started) / Math.max(600, estimatedSpeechMs(this.text));
      this.emit(Math.ceil(Math.min(1, Math.max(0, progress)) * this.words.length));
      this.raf = window.requestAnimationFrame(tick);
    };
    this.raf = window.requestAnimationFrame(tick);
  }

  /** Reveals at a natural speaking pace (voice muted / no audio). */
  startPaced() {
    this.cancel();
    const step = () => {
      if (this.done || this.shown >= this.words.length) return;
      this.emit(this.shown + 1);
      const word = this.words[this.shown - 1] ?? "";
      this.timer = window.setTimeout(step, wordDurationMs(word));
    };
    step();
  }

  /** Chunk finished: show all of it and stop scheduling. */
  finish() {
    this.cancel();
    this.done = true;
    this.emit(this.words.length);
  }

  cancel() {
    if (this.timer !== null) window.clearTimeout(this.timer);
    if (this.raf !== null) window.cancelAnimationFrame(this.raf);
    this.timer = null;
    this.raf = null;
  }
}

/** ~165 wpm, weighted by word length. */
export function wordDurationMs(word: string) {
  return Math.min(700, Math.max(130, 90 + word.length * 42));
}

export function estimatedSpeechMs(text: string) {
  return text.split(/\s+/).filter(Boolean).reduce((sum, w) => sum + wordDurationMs(w), 0);
}

export type AudioResult = { blob: Blob } | { error: VoiceErrorCode | typeof VOICE_ABORTED };

export interface SpeechQueueOptions {
  /** Fetches audio for one chunk from the Gradr voice backend. */
  fetchAudio: (text: string, signal: AbortSignal) => Promise<AudioResult>;
  /** Fired the moment a chunk's audio starts — the caption begins empty. */
  onChunkStart: (text: string) => void;
  /** Word-by-word reveal of the chunk currently being spoken. */
  onChunkReveal: (revealed: string) => void;
  /** The chunk has been fully spoken and is now finalized transcript. */
  onChunkSpoken: (text: string) => void;
  onSpeakingChange: (speaking: boolean) => void;
  /** Everything queued has been spoken and the input stream was closed. */
  onDrained: () => void;
  /** Voice failed — the turn is aborted and must be retried by the user. */
  onFailure: (code: VoiceErrorCode) => void;
  /** Extra silence between thoughts, from the persona profile. */
  beatMs?: number;
}

interface QueueItem {
  text: string;
  audio: Promise<AudioResult>;
}


/** Plays interviewer speech chunk by chunk, in order, with no overlap. */
export class SpeechQueue {
  private queue: QueueItem[] = [];
  private running = false;
  private closed = false;
  private stopped = false;
  private audio: HTMLAudioElement | null = null;
  private url: string | null = null;
  private controllers = new Set<AbortController>();
  private failure: VoiceErrorCode | null = null;
  /** Caption scheduler for the chunk currently playing. */
  private reveal: TimedReveal | null = null;


  constructor(private opts: SpeechQueueOptions) {}

  get isSpeaking() {
    return this.running;
  }

  /** Enqueues a thought; its audio starts downloading immediately. */
  push(text: string) {
    if (this.stopped) return;
    const clean = cleanForSpeech(text);
    if (!clean) return;

    const controller = new AbortController();
    this.controllers.add(controller);
    const audio = this.opts
      .fetchAudio(clean, controller.signal)
      .catch((e): AudioResult => {
        console.error("[voice] chunk fetch failed", e);
        return { error: "VOICE_CONNECTION_FAILED" };
      })
      .finally(() => this.controllers.delete(controller));


    this.queue.push({ text: clean, audio });
    void this.pump();
  }

  /** No more chunks will arrive; onDrained fires once playback catches up. */
  end() {
    this.closed = true;
    if (!this.running && this.queue.length === 0 && !this.stopped) this.opts.onDrained();
  }

  /** Hard stop — used for barge-in, session end and unmount. */
  stop() {
    this.stopped = true;
    this.queue = [];
    this.controllers.forEach((c) => c.abort());
    this.controllers.clear();
    this.teardownAudio();
    if (this.running) {
      this.running = false;
      this.opts.onSpeakingChange(false);
    }
  }

  /** Resets after a stop so the same queue instance can host the next turn. */
  reset() {
    this.stop();
    this.stopped = false;
    this.closed = false;
    this.failure = null;
  }

  private teardownAudio() {
    this.reveal?.cancel();
    if (this.audio) {
      this.audio.onended = null;
      this.audio.onerror = null;
      this.audio.pause();
      this.audio.src = "";
      this.audio = null;
    }
    if (this.url) {
      URL.revokeObjectURL(this.url);
      this.url = null;
    }
  }

  private async pump() {
    if (this.running || this.stopped) return;
    this.running = true;
    this.opts.onSpeakingChange(true);

    while (!this.stopped) {
      const item = this.queue.shift();
      if (!item) {
        if (this.closed) break;
        // Model is still generating — wait for the next thought.
        await delay(60);
        continue;
      }

      let result: AudioResult;
      try {
        result = await item.audio;
      } catch (e) {
        console.error("[voice] chunk fetch rejected", e);
        result = { error: "VOICE_CONNECTION_FAILED" };
      }
      if (this.stopped) break;

      if ("error" in result) {
        // No substitute voice: end the turn and let the UI offer a retry.
        if (result.error === VOICE_ABORTED) break;
        this.failure = result.error;
        break;
      }

      this.opts.onChunkStart(item.text);
      try {
        await this.playBlob(result.blob, item.text);
        this.opts.onChunkSpoken(item.text);
      } catch (error) {
        console.error("[voice] playback failed", error);
        this.failure = playbackErrorCode(error);
        break;
      }
      if (this.stopped) break;


      await delay(pauseAfter(item.text, this.opts.beatMs ?? 260));
    }

    this.running = false;
    if (this.stopped) return;
    this.opts.onSpeakingChange(false);

    if (this.failure) {
      const code = this.failure;
      this.failure = null;
      this.queue = [];
      this.controllers.forEach((c) => c.abort());
      this.controllers.clear();
      this.opts.onFailure(code);
      return;
    }
    if (this.closed && this.queue.length === 0) this.opts.onDrained();
  }

  private playBlob(blob: Blob, text: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.teardownAudio();
      this.reveal?.cancel();
      const reveal = new TimedReveal(text, (revealed) => this.opts.onChunkReveal(revealed));
      this.reveal = reveal;
      const url = URL.createObjectURL(blob);
      this.url = url;
      const el = new Audio(url);
      this.audio = el;
      const finish = () => {
        reveal.finish();
        this.teardownAudio();
        resolve();
      };
      const fail = (code: VoiceErrorCode) => {
        reveal.cancel();
        this.teardownAudio();
        reject(new Error(code));
      };
      el.onended = finish;
      el.onerror = () => fail("VOICE_CONNECTION_FAILED");
      el.play().then(() => reveal.syncTo(el)).catch((error) => {
        console.error("[voice] play() rejected", error);
        fail(error?.name === "NotAllowedError" ? "VOICE_PERMISSION_DENIED" : "VOICE_CONNECTION_FAILED");
      });
    });
  }
}


function delay(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}

/** Maps a thrown playback error back onto the Gradr voice vocabulary. */
function playbackErrorCode(error: unknown): VoiceErrorCode {
  return toVoiceErrorCode(error instanceof Error ? error.message : error);
}
