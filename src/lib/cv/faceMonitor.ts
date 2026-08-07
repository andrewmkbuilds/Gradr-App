import {
  FilesetResolver,
  FaceLandmarker,
  type FaceLandmarkerResult,
} from "@mediapipe/tasks-vision";

/**
 * Lightweight interview integrity monitor.
 *
 * Runs MediaPipe FaceLandmarker on a <video> stream and aggregates
 * presence / gaze / multi-face signals used by the mock interview report.
 * All processing stays on-device — no frames leave the browser.
 */

export interface IntegritySnapshot {
  /** Percentage of sampled frames where exactly one face was visible. */
  presencePct: number;
  /** Percentage of sampled frames where the candidate looked at the camera. */
  eyeContactPct: number;
  /** Times the candidate left the frame for longer than ~1.5s. */
  absenceEvents: number;
  /** Frames where more than one face was detected. */
  multiFaceFrames: number;
  /** Total frames sampled. */
  frames: number;
  /** Live status for the UI. */
  status: "absent" | "looking-away" | "multiple-faces" | "good";
}

const WASM_ROOT =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

const EMPTY: IntegritySnapshot = {
  presencePct: 0,
  eyeContactPct: 0,
  absenceEvents: 0,
  multiFaceFrames: 0,
  frames: 0,
  status: "absent",
};

/** Estimates whether the head is pointing at the camera from landmark spread. */
function isFacingCamera(result: FaceLandmarkerResult): boolean {
  const lm = result.faceLandmarks?.[0];
  if (!lm) return false;
  // 33 = right eye outer, 263 = left eye outer, 1 = nose tip
  const right = lm[33];
  const left = lm[263];
  const nose = lm[1];
  if (!right || !left || !nose) return false;
  const mid = (right.x + left.x) / 2;
  const span = Math.abs(left.x - right.x) || 1;
  const yaw = Math.abs(nose.x - mid) / span; // 0 = centered
  const pitch = Math.abs(nose.y - (right.y + left.y) / 2) / span;
  return yaw < 0.35 && pitch < 1.1;
}

export class FaceMonitor {
  private landmarker: FaceLandmarker | null = null;
  private raf: number | null = null;
  private video: HTMLVideoElement | null = null;
  private lastTs = -1;
  private absentSince: number | null = null;

  private frames = 0;
  private presentFrames = 0;
  private contactFrames = 0;
  private absenceEvents = 0;
  private multiFaceFrames = 0;
  private status: IntegritySnapshot["status"] = "absent";

  async init() {
    if (this.landmarker) return;
    const fileset = await FilesetResolver.forVisionTasks(WASM_ROOT);
    this.landmarker = await FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
      runningMode: "VIDEO",
      numFaces: 2,
    });
  }

  start(video: HTMLVideoElement, onTick?: (s: IntegritySnapshot) => void) {
    this.video = video;
    const loop = () => {
      this.raf = requestAnimationFrame(loop);
      const v = this.video;
      if (!v || !this.landmarker || v.readyState < 2) return;
      const ts = performance.now();
      if (ts - this.lastTs < 120) return; // ~8 fps is plenty
      this.lastTs = ts;

      let result: FaceLandmarkerResult;
      try {
        result = this.landmarker.detectForVideo(v, ts);
      } catch {
        return;
      }

      const faces = result.faceLandmarks?.length ?? 0;
      this.frames += 1;

      if (faces === 0) {
        this.status = "absent";
        this.absentSince ??= ts;
        if (ts - this.absentSince > 1500) {
          this.absenceEvents += 1;
          this.absentSince = ts;
        }
      } else {
        this.absentSince = null;
        this.presentFrames += faces === 1 ? 1 : 0;
        if (faces > 1) {
          this.multiFaceFrames += 1;
          this.status = "multiple-faces";
        } else if (isFacingCamera(result)) {
          this.contactFrames += 1;
          this.status = "good";
        } else {
          this.status = "looking-away";
        }
      }

      onTick?.(this.snapshot());
    };
    this.raf = requestAnimationFrame(loop);
  }

  snapshot(): IntegritySnapshot {
    if (!this.frames) return EMPTY;
    return {
      presencePct: Math.round((this.presentFrames / this.frames) * 100),
      eyeContactPct: Math.round((this.contactFrames / this.frames) * 100),
      absenceEvents: this.absenceEvents,
      multiFaceFrames: this.multiFaceFrames,
      frames: this.frames,
      status: this.status,
    };
  }

  stop() {
    if (this.raf !== null) cancelAnimationFrame(this.raf);
    this.raf = null;
    this.video = null;
  }

  dispose() {
    this.stop();
    this.landmarker?.close();
    this.landmarker = null;
  }
}

export const EMPTY_INTEGRITY = EMPTY;
