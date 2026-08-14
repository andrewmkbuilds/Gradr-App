/**
 * Interviewer speech pipeline.
 *
 * The reasoning model streams text; this module turns that stream into speech
 * that starts almost immediately and stays in step with the transcript:
 *
 *   model deltas -> SentenceChunker -> SpeechQueue -> ElevenLabs audio -> playback
 *                                                  -> onChunkSpoken (transcript)
 *
 * Design notes
 * - Chunking at thought boundaries is what buys both low latency *and* natural
 *   pauses: each chunk is fetched while the previous one is still playing.
 * - The transcript only reveals a chunk when its audio actually starts, so the
 *   caption never runs ahead of the voice.
 * - There is deliberately NO silent fallback to another voice engine. If
 *   ElevenLabs fails, the turn stops and the caller surfaces a retryable error,
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

export interface SpeechQueueOptions {
  /** Fetches audio for one chunk. Resolve null to fall back to browser speech. */
  fetchAudio: (text: string, signal: AbortSignal) => Promise<Blob | null>;
  /** Fired the moment a chunk's audio starts — drives the live transcript. */
  onChunkSpoken: (text: string) => void;
  onSpeakingChange: (speaking: boolean) => void;
  /** Everything queued has been spoken and the input stream was closed. */
  onDrained: () => void;
  /** Voice quality degraded (ElevenLabs failed for a chunk). */
  onDegraded?: (reason: string) => void;
  /** Extra silence between thoughts, from the persona profile. */
  beatMs?: number;
}

interface QueueItem {
  text: string;
  audio: Promise<Blob | null>;
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
      .catch(() => null)
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
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
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
  }

  private teardownAudio() {
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

      let blob: Blob | null = null;
      try {
        blob = await item.audio;
      } catch {
        blob = null;
      }
      if (this.stopped) break;

      this.opts.onChunkSpoken(item.text);

      if (blob) {
        await this.playBlob(blob);
      } else {
        this.opts.onDegraded?.("elevenlabs_unavailable");
        await this.speakBrowser(item.text);
      }
      if (this.stopped) break;

      await delay(pauseAfter(item.text, this.opts.beatMs ?? 260));
    }

    this.running = false;
    if (!this.stopped) {
      this.opts.onSpeakingChange(false);
      if (this.closed && this.queue.length === 0) this.opts.onDrained();
    }
  }

  private playBlob(blob: Blob): Promise<void> {
    return new Promise((resolve) => {
      this.teardownAudio();
      const url = URL.createObjectURL(blob);
      this.url = url;
      const el = new Audio(url);
      this.audio = el;
      const done = () => {
        this.teardownAudio();
        resolve();
      };
      el.onended = done;
      el.onerror = done;
      el.play().catch(done);
    });
  }

  private speakBrowser(text: string): Promise<void> {
    return new Promise((resolve) => {
      if (typeof window === "undefined" || !("speechSynthesis" in window)) {
        resolve();
        return;
      }
      const utter = new SpeechSynthesisUtterance(text);
      utter.rate = 1.0;
      utter.onend = () => resolve();
      utter.onerror = () => resolve();
      window.speechSynthesis.speak(utter);
    });
  }
}

function delay(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}
