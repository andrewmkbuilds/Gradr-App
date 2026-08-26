/**
 * Synthetic camera / microphone for the interview flow.
 *
 * `getUserMedia` is replaced with a canvas video track plus a real (quiet but
 * measurable) oscillator audio track, so the pre-flight check, the presence
 * monitor and the interview itself run exactly as they do with hardware. The
 * denial and no-device modes reproduce the two permission failures the UI has
 * to handle.
 */
import { sandboxFlags, type MediaMode } from "./flags";

function syntheticVideoTrack(): MediaStreamTrack {
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 480;
  const ctx = canvas.getContext("2d")!;
  let frame = 0;

  const draw = () => {
    frame += 1;
    ctx.fillStyle = "#0f1d22";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // A slowly moving "head" so presence/eye-contact analysis has something
    // that changes between frames rather than a frozen image.
    const x = 320 + Math.sin(frame / 40) * 24;
    ctx.fillStyle = "#d9c3b0";
    ctx.beginPath();
    ctx.ellipse(x, 250, 92, 118, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f9f7f6";
    ctx.font = "20px sans-serif";
    ctx.fillText("QA sandbox camera", 20, 40);
  };

  draw();
  const stream = (canvas as HTMLCanvasElement & { captureStream(fps?: number): MediaStream }).captureStream(24);
  const timer = window.setInterval(draw, 1000 / 24);
  const track = stream.getVideoTracks()[0];
  track.addEventListener("ended", () => window.clearInterval(timer));
  return track;
}

function syntheticAudioTrack(): MediaStreamTrack {
  const ctx = new AudioContext();
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  const destination = ctx.createMediaStreamDestination();
  oscillator.type = "sine";
  oscillator.frequency.value = 220;
  // Loud enough for the pre-flight level meter to register, quiet enough to
  // avoid a piercing tone if the stream is ever monitored.
  gain.gain.value = 0.12;
  oscillator.connect(gain).connect(destination);
  oscillator.start();
  const track = destination.stream.getAudioTracks()[0];
  track.addEventListener("ended", () => {
    oscillator.stop();
    void ctx.close().catch(() => undefined);
  });
  return track;
}

function fakeStream(constraints?: MediaStreamConstraints): MediaStream {
  const stream = new MediaStream();
  if (constraints?.video !== false && constraints?.video !== undefined) stream.addTrack(syntheticVideoTrack());
  if (constraints?.audio) stream.addTrack(syntheticAudioTrack());
  if (!constraints) {
    stream.addTrack(syntheticVideoTrack());
    stream.addTrack(syntheticAudioTrack());
  }
  return stream;
}

function deny(mode: MediaMode): never {
  const error = new Error(
    mode === "denied"
      ? "Permission denied by the QA sandbox"
      : "Requested device not found (QA sandbox)",
  );
  error.name = mode === "denied" ? "NotAllowedError" : "NotFoundError";
  throw error;
}

let installed = false;

/** Patches `navigator.mediaDevices` once; each call re-reads the current mode. */
export function installMediaSandbox(): void {
  if (installed || typeof navigator === "undefined" || !navigator.mediaDevices) return;
  installed = true;

  const devices = navigator.mediaDevices;
  const originalGetUserMedia = devices.getUserMedia.bind(devices);
  const originalEnumerate = devices.enumerateDevices.bind(devices);

  devices.getUserMedia = async (constraints?: MediaStreamConstraints): Promise<MediaStream> => {
    const mode = sandboxFlags().media;
    if (mode === "off") return originalGetUserMedia(constraints);
    if (mode !== "granted") deny(mode);
    return fakeStream(constraints);
  };

  devices.enumerateDevices = async (): Promise<MediaDeviceInfo[]> => {
    const mode = sandboxFlags().media;
    if (mode === "off") return originalEnumerate();
    if (mode === "no-device") return [];
    const make = (kind: MediaDeviceKind, label: string, id: string) =>
      ({ deviceId: id, groupId: "qa-sandbox", kind, label, toJSON: () => ({}) }) as MediaDeviceInfo;
    return [
      make("videoinput", "QA sandbox camera", "qa-video"),
      make("audioinput", "QA sandbox microphone", "qa-audio"),
      make("audiooutput", "QA sandbox speaker", "qa-output"),
    ];
  };
}
