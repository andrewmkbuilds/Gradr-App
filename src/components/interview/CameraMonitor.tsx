import { useEffect, useRef, useState } from "react";
import { Camera, CameraOff, ShieldCheck, ShieldAlert, Eye, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FaceMonitor, EMPTY_INTEGRITY, type IntegritySnapshot } from "@/lib/cv/faceMonitor";

interface Props {
  active: boolean;
  onSnapshot?: (s: IntegritySnapshot) => void;
}

const STATUS_COPY: Record<IntegritySnapshot["status"], { label: string; tone: string }> = {
  good: { label: "Great presence", tone: "text-primary" },
  "looking-away": { label: "Look at the camera", tone: "text-warning" },
  "multiple-faces": { label: "Multiple faces detected", tone: "text-destructive" },
  absent: { label: "No face detected", tone: "text-muted-foreground" },
};

/** Webcam panel with on-device presence + eye-contact analysis. */
export function CameraMonitor({ active, onSnapshot }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const monitorRef = useRef<FaceMonitor | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<IntegritySnapshot>(EMPTY_INTEGRITY);

  useEffect(() => {
    if (!enabled || !active) return;
    let cancelled = false;

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480, facingMode: "user" },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
        const monitor = new FaceMonitor();
        await monitor.init();
        if (cancelled) return monitor.dispose();
        monitorRef.current = monitor;
        if (videoRef.current) {
          monitor.start(videoRef.current, (s) => {
            setSnapshot(s);
            onSnapshot?.(s);
          });
        }
      } catch {
        if (!cancelled) {
          setError("Camera unavailable. You can continue with voice or text only.");
          setEnabled(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      monitorRef.current?.dispose();
      monitorRef.current = null;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [enabled, active, onSnapshot]);

  const status = STATUS_COPY[snapshot.status];

  return (
    <div className="elev-2 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-foreground flex items-center gap-2">
          {snapshot.status === "multiple-faces" ? (
            <ShieldAlert className="h-4 w-4 text-destructive" />
          ) : (
            <ShieldCheck className="h-4 w-4 text-primary" />
          )}
          Presence monitor
        </p>
        <Button size="sm" variant="outline" onClick={() => setEnabled((v) => !v)}>
          {enabled ? <CameraOff className="h-4 w-4 mr-2" /> : <Camera className="h-4 w-4 mr-2" />}
          {enabled ? "Turn off" : "Turn on"}
        </Button>
      </div>

      <div className="relative aspect-video rounded-lg overflow-hidden bg-secondary">
        <video
          ref={videoRef}
          muted
          playsInline
          className="h-full w-full object-cover scale-x-[-1]"
        />
        {!enabled && (
          <div className="absolute inset-0 grid place-items-center text-xs text-muted-foreground px-4 text-center">
            Camera off — enable it for eye-contact and presence coaching. Video never leaves your device.
          </div>
        )}
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      <div className="grid grid-cols-3 gap-2 text-center">
        <Metric icon={<Eye className="h-3.5 w-3.5" />} label="Eye contact" value={`${snapshot.eyeContactPct}%`} />
        <Metric icon={<Camera className="h-3.5 w-3.5" />} label="In frame" value={`${snapshot.presencePct}%`} />
        <Metric icon={<Users className="h-3.5 w-3.5" />} label="Flags" value={String(snapshot.absenceEvents + (snapshot.multiFaceFrames ? 1 : 0))} />
      </div>

      {enabled && <p className={`text-xs font-medium ${status.tone}`}>{status.label}</p>}
    </div>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg bg-secondary/60 py-2">
      <div className="flex items-center justify-center gap-1 text-muted-foreground text-[11px]">
        {icon}
        {label}
      </div>
      <p className="text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}
