/**
 * Gemini Live realtime voice client.
 *
 * Connects over WebSocket using a short-lived ephemeral token minted by the
 * `interview-realtime-token` edge function — the Gemini API key never reaches
 * the browser. Handles mic capture (16 kHz PCM), streamed playback (24 kHz PCM),
 * natural barge-in, and input/output transcription.
 */

export type LiveStatus = "idle" | "connecting" | "live" | "closed" | "error";

export interface LiveCallbacks {
  onStatus?: (status: LiveStatus, detail?: string) => void;
  /** Streaming partial + final transcript of the candidate's speech. */
  onUserTranscript?: (text: string, final: boolean) => void;
  /** Streaming partial + final transcript of the interviewer's speech. */
  onModelTranscript?: (text: string, final: boolean) => void;
  /** Fired when the candidate barges in and the interviewer is cut off. */
  onInterrupted?: () => void;
  /** Fired whenever the interviewer starts/stops speaking. */
  onSpeakingChange?: (speaking: boolean) => void;
  /** Fired whenever voice activity is detected on the mic. */
  onListeningChange?: (listening: boolean) => void;
  onError?: (message: string) => void;
}

const WS_BASE =
  "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent";

const INPUT_RATE = 16000;
const OUTPUT_RATE = 24000;

/** AudioWorklet that forwards mono Float32 frames to the main thread. */
const CAPTURE_WORKLET = `
class CaptureProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (input && input[0]) this.port.postMessage(input[0].slice(0));
    return true;
  }
}
registerProcessor('capture-processor', CaptureProcessor);
`;

function floatToPcm16(input: Float32Array): ArrayBuffer {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out.buffer;
}

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Downsamples a Float32 frame to the target rate with linear interpolation. */
function resample(input: Float32Array, from: number, to: number): Float32Array {
  if (from === to) return input;
  const ratio = from / to;
  const length = Math.floor(input.length / ratio);
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const pos = i * ratio;
    const idx = Math.floor(pos);
    const frac = pos - idx;
    const a = input[idx] ?? 0;
    const b = input[idx + 1] ?? a;
    out[i] = a + (b - a) * frac;
  }
  return out;
}

export class GeminiLiveSession {
  private ws: WebSocket | null = null;
  private inputCtx: AudioContext | null = null;
  private outputCtx: AudioContext | null = null;
  private worklet: AudioWorkletNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private stream: MediaStream | null = null;

  private playhead = 0;
  private queued: AudioBufferSourceNode[] = [];
  private speaking = false;
  private listening = false;
  private muted = false;
  private closedByUser = false;

  private userBuf = "";
  private modelBuf = "";

  constructor(private cb: LiveCallbacks = {}) {}

  get isMuted() {
    return this.muted;
  }

  async connect(token: string, model: string, stream: MediaStream) {
    this.closedByUser = false;
    this.cb.onStatus?.("connecting");
    this.stream = stream;

    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(`${WS_BASE}?access_token=${encodeURIComponent(token)}`);
      ws.binaryType = "arraybuffer";
      this.ws = ws;

      const failFast = (msg: string) => {
        reject(new Error(msg));
      };

      ws.onopen = () => {
        // Config lives inside the ephemeral token's liveConnectConstraints,
        // so the setup frame only needs to name the model.
        ws.send(JSON.stringify({ setup: { model } }));
      };
      ws.onerror = () => failFast("Realtime connection failed");
      ws.onclose = (e) => {
        this.teardownAudio();
        if (this.closedByUser) {
          this.cb.onStatus?.("closed");
        } else {
          this.cb.onStatus?.("error", e.reason || "Connection closed");
          this.cb.onError?.(e.reason || "The realtime voice connection dropped.");
        }
      };
      ws.onmessage = async (event) => {
        const raw =
          typeof event.data === "string"
            ? event.data
            : await new Blob([event.data]).text();
        let msg: any;
        try {
          msg = JSON.parse(raw);
        } catch {
          return;
        }

        if (msg.setupComplete) {
          void this.startCapture().then(resolve).catch((e) => failFast(String(e)));
          this.cb.onStatus?.("live");
          return;
        }
        this.handleServerMessage(msg);
      };
    });
  }

  private handleServerMessage(msg: any) {
    const sc = msg.serverContent;
    if (!sc) return;

    // Barge-in: the model was cut off — drop everything still queued.
    if (sc.interrupted) {
      this.flushPlayback();
      this.cb.onInterrupted?.();
    }

    if (sc.inputTranscription?.text) {
      this.userBuf += sc.inputTranscription.text;
      this.cb.onUserTranscript?.(this.userBuf, false);
      if (!this.listening) {
        this.listening = true;
        this.cb.onListeningChange?.(true);
      }
    }
    if (sc.outputTranscription?.text) {
      this.modelBuf += sc.outputTranscription.text;
      this.cb.onModelTranscript?.(this.modelBuf, false);
    }

    const parts = sc.modelTurn?.parts ?? [];
    for (const p of parts) {
      const data = p.inlineData?.data;
      if (data && String(p.inlineData?.mimeType ?? "").startsWith("audio/")) {
        this.enqueueAudio(fromBase64(data));
      }
    }

    if (sc.turnComplete || sc.generationComplete) {
      if (this.userBuf.trim()) {
        this.cb.onUserTranscript?.(this.userBuf.trim(), true);
        this.userBuf = "";
      }
      if (this.modelBuf.trim()) {
        this.cb.onModelTranscript?.(this.modelBuf.trim(), true);
        this.modelBuf = "";
      }
      if (this.listening) {
        this.listening = false;
        this.cb.onListeningChange?.(false);
      }
    }
  }

  private async startCapture() {
    if (!this.stream) throw new Error("No microphone stream");
    const ctx = new AudioContext();
    this.inputCtx = ctx;
    if (ctx.state === "suspended") await ctx.resume().catch(() => {});

    const blobUrl = URL.createObjectURL(new Blob([CAPTURE_WORKLET], { type: "application/javascript" }));
    await ctx.audioWorklet.addModule(blobUrl);
    URL.revokeObjectURL(blobUrl);

    this.source = ctx.createMediaStreamSource(this.stream);
    this.worklet = new AudioWorkletNode(ctx, "capture-processor");
    this.worklet.port.onmessage = (e: MessageEvent<Float32Array>) => {
      if (this.muted || this.ws?.readyState !== WebSocket.OPEN) return;
      const frame = resample(e.data, ctx.sampleRate, INPUT_RATE);
      this.ws.send(
        JSON.stringify({
          realtimeInput: {
            audio: {
              data: toBase64(floatToPcm16(frame)),
              mimeType: `audio/pcm;rate=${INPUT_RATE}`,
            },
          },
        }),
      );
    };
    this.source.connect(this.worklet);
    // Keep the graph pulling without echoing the mic to the speakers.
    const sink = ctx.createGain();
    sink.gain.value = 0;
    this.worklet.connect(sink).connect(ctx.destination);
  }

  private enqueueAudio(bytes: Uint8Array) {
    if (!this.outputCtx) this.outputCtx = new AudioContext({ sampleRate: OUTPUT_RATE });
    const ctx = this.outputCtx;
    if (ctx.state === "suspended") void ctx.resume().catch(() => {});

    const samples = new Int16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 2));
    if (!samples.length) return;
    const floats = Float32Array.from(samples, (s) => s / 32768);
    const buffer = ctx.createBuffer(1, floats.length, OUTPUT_RATE);
    buffer.copyToChannel(floats, 0);

    const node = ctx.createBufferSource();
    node.buffer = buffer;
    node.connect(ctx.destination);

    const startAt = this.playhead === 0 || this.playhead < ctx.currentTime
      ? ctx.currentTime + 0.04
      : this.playhead;
    node.start(startAt);
    this.playhead = startAt + buffer.duration;

    this.queued.push(node);
    node.onended = () => {
      this.queued = this.queued.filter((n) => n !== node);
      if (!this.queued.length && this.speaking) {
        this.speaking = false;
        this.cb.onSpeakingChange?.(false);
      }
    };

    if (!this.speaking) {
      this.speaking = true;
      this.cb.onSpeakingChange?.(true);
    }
  }

  /** Immediately silences queued interviewer audio (barge-in / manual stop). */
  flushPlayback() {
    for (const node of this.queued) {
      try {
        node.stop();
      } catch {
        /* already ended */
      }
    }
    this.queued = [];
    this.playhead = 0;
    if (this.speaking) {
      this.speaking = false;
      this.cb.onSpeakingChange?.(false);
    }
  }

  /** Manual barge-in from a UI button: cut the interviewer off and take the floor. */
  interrupt() {
    this.flushPlayback();
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ realtimeInput: { activityStart: {} } }));
    }
    this.cb.onInterrupted?.();
  }

  /** Injects a text turn (used for typed answers while in voice mode). */
  sendText(text: string) {
    if (this.ws?.readyState !== WebSocket.OPEN || !text.trim()) return;
    this.flushPlayback();
    this.ws.send(
      JSON.stringify({
        clientContent: {
          turns: [{ role: "user", parts: [{ text }] }],
          turnComplete: true,
        },
      }),
    );
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    this.stream?.getAudioTracks().forEach((t) => (t.enabled = !muted));
  }

  private teardownAudio() {
    this.flushPlayback();
    try {
      this.worklet?.port.close();
      this.worklet?.disconnect();
      this.source?.disconnect();
    } catch {
      /* noop */
    }
    void this.inputCtx?.close().catch(() => {});
    void this.outputCtx?.close().catch(() => {});
    this.worklet = null;
    this.source = null;
    this.inputCtx = null;
    this.outputCtx = null;
  }

  close() {
    this.closedByUser = true;
    try {
      this.ws?.close();
    } catch {
      /* noop */
    }
    this.ws = null;
    this.teardownAudio();
  }
}
