import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Mic, Wifi, CheckCircle2, XCircle, Loader2, RefreshCw, Keyboard } from "lucide-react";
import { Button } from "@/components/ds/Button";

/**
 * Mandatory pre-interview device check: camera, microphone level and network.
 * The session cannot begin until camera + mic pass, mirroring a real remote loop.
 */

type CheckState = "idle" | "checking" | "pass" | "fail";

interface Props {
  onReady: (stream: MediaStream) => void;
  /**
   * Start the session without camera/mic. Offered whenever the device check
   * can't pass, so a blocked permission never dead-ends the interview — the
   * candidate answers by typing and still gets a scored report.
   */
  onTextOnly?: () => void;
  onCancel?: () => void;
}

export function PreflightCheck({ onReady, onTextOnly, onCancel }: Props) {
  const [camera, setCamera] = useState<CheckState>("idle");
  const [mic, setMic] = useState<CheckState>("idle");
  const [network, setNetwork] = useState<CheckState>("idle");
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);

  const cleanup = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    void audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
  }, []);

  const run = useCallback(async () => {
    setError(null);
    setCamera("checking");
    setMic("checking");
    setNetwork("checking");
    cleanup();
    streamRef.current?.getTracks().forEach((t) => t.stop());

    // Network: round-trip to the app origin.
    const t0 = performance.now();
    try {
      await fetch(`${window.location.origin}/favicon.ico?ping=${Date.now()}`, { cache: "no-store" });
      const ms = Math.round(performance.now() - t0);
      setLatencyMs(ms);
      setNetwork(ms < 1200 ? "pass" : "fail");
    } catch {
      setNetwork("fail");
    }

    // Camera + microphone.
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, facingMode: "user" },
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setCamera(stream.getVideoTracks().length ? "pass" : "fail");

      if (stream.getAudioTracks().length) {
        const ctx = new AudioContext();
        audioCtxRef.current = ctx;
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);
        const buf = new Uint8Array(analyser.frequencyBinCount);
        let peak = 0;
        const tick = () => {
          analyser.getByteTimeDomainData(buf);
          let sum = 0;
          for (let i = 0; i < buf.length; i++) {
            const v = (buf[i] - 128) / 128;
            sum += v * v;
          }
          const rms = Math.sqrt(sum / buf.length);
          const pct = Math.min(100, Math.round(rms * 400));
          setLevel(pct);
          peak = Math.max(peak, pct);
          if (peak > 6) setMic("pass");
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setMic("fail");
      }
    } catch (e) {
      setCamera("fail");
      setMic("fail");
      setError(
        e instanceof Error && e.name === "NotAllowedError"
          ? "Camera and microphone access was blocked. Allow both in your browser, then re-run the check."
          : "We couldn't reach your camera or microphone. Check they aren't in use by another app.",
      );
    }
  }, [cleanup]);

  useEffect(() => {
    void run();
    return () => {
      cleanup();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ready = camera === "pass" && mic === "pass";
  /** Devices can't be used — offer the typed session instead of a dead end. */
  const blocked = camera === "fail" || mic === "fail";

  const rows: { icon: typeof Camera; label: string; state: CheckState; hint: string }[] = [
    { icon: Camera, label: "Camera", state: camera, hint: "Used for on-device presence coaching only." },
    {
      icon: Mic,
      label: "Microphone",
      state: mic,
      hint: mic === "pass" ? "Levels look good." : "Say a few words so we can pick up your voice.",
    },
    {
      icon: Wifi,
      label: "Connection",
      state: network,
      hint: latencyMs !== null ? `${latencyMs}ms round-trip` : "Measuring…",
    },
  ];

  return (
    <div className="elev-2 rounded-xl p-6 space-y-5 animate-fade-in">
      <div>
        <h3 className="text-lg font-semibold text-foreground">Device check</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Just like a real remote interview — we verify your camera, mic and connection before you start.
        </p>
      </div>

      <div className="grid md:grid-cols-[220px_1fr] gap-5">
        <div className="relative rounded-xl overflow-hidden bg-secondary aspect-[4/3]">
          <video ref={videoRef} muted playsInline className="w-full h-full object-cover scale-x-[-1]" />
          {camera !== "pass" && (
            <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
              {camera === "checking" ? "Starting camera…" : "No camera"}
            </div>
          )}
        </div>

        <div className="space-y-3">
          {rows.map((r) => (
            <div key={r.label} className="flex items-start gap-3">
              <div className="h-8 w-8 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                <r.icon className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  {r.label}
                  {r.state === "checking" && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                  {r.state === "pass" && <CheckCircle2 className="h-3.5 w-3.5 text-primary" />}
                  {r.state === "fail" && <XCircle className="h-3.5 w-3.5 text-destructive" />}
                </div>
                <p className="text-xs text-muted-foreground">{r.hint}</p>
                {r.label === "Microphone" && (
                  <div className="mt-2 h-1.5 rounded-full bg-secondary overflow-hidden">
                    <div
                      className="h-full bg-primary transition-[width] duration-75"
                      style={{ width: `${level}%` }}
                    />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {error && (
        <div
          role="alert"
          data-testid="preflight-error"
          className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
        >
          {error}
        </div>
      )}

      {blocked && onTextOnly && (
        <div
          data-testid="preflight-text-fallback"
          className="rounded-lg border border-border bg-secondary/50 p-3 text-sm text-muted-foreground"
        >
          You don't need a camera or microphone to practise. Start in text mode and type your
          answers — the interviewer still asks the full set of questions and you still get a scored
          report at the end.
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          onClick={() => streamRef.current && onReady(streamRef.current)}
          disabled={!ready}
          className="bg-primary text-primary-foreground hover:bg-primary/90"
        >
          {ready ? "Start interview" : "Waiting for camera & mic"}
        </Button>
        {blocked && onTextOnly && (
          <Button variant="outline" onClick={onTextOnly} data-testid="preflight-start-text">
            <Keyboard className="h-4 w-4 mr-2" aria-hidden="true" />
            Continue in text mode
          </Button>
        )}
        <Button variant="outline" onClick={() => void run()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Re-run check
        </Button>
        {onCancel && (
          <Button variant="ghost" onClick={onCancel}>
            Back
          </Button>
        )}
      </div>
    </div>
  );
}
