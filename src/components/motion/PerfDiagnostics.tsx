/**
 * Internal performance diagnostics overlay.
 *
 * Samples requestAnimationFrame timing to report live FPS, dropped frames and
 * whether the spatial depth system is active on this device. Enabled from
 * Settings → Motion & performance (persisted), so it can be verified on any
 * real device without a dev build.
 */
import { useEffect, useRef, useState } from "react";
import { Activity, X } from "lucide-react";
import { useMotionPrefs } from "@/hooks/useMotionPrefs";
import { useDepthEnabled } from "@/components/motion/depth";
import { cn } from "@/lib/utils";

const TARGET_FPS = 55;
/** A frame longer than this counts as dropped at 60Hz. */
const DROP_BUDGET_MS = 1000 / 45;

export interface FrameStats {
  fps: number;
  worstMs: number;
  dropped: number;
  frames: number;
}

/** Rolling frame-timing sampler. Pauses when the tab is hidden. */
export function useFrameStats(active: boolean): FrameStats {
  const [stats, setStats] = useState<FrameStats>({ fps: 0, worstMs: 0, dropped: 0, frames: 0 });
  const acc = useRef({ frames: 0, dropped: 0, worst: 0, last: 0, since: 0 });

  useEffect(() => {
    if (!active || typeof window === "undefined") return;
    let raf = 0;
    const a = acc.current;
    a.last = performance.now();
    a.since = a.last;

    const tick = (now: number) => {
      const delta = now - a.last;
      a.last = now;
      if (delta > 0 && delta < 2000) {
        a.frames += 1;
        if (delta > DROP_BUDGET_MS) a.dropped += 1;
        if (delta > a.worst) a.worst = delta;
      }
      if (now - a.since >= 500) {
        const seconds = (now - a.since) / 1000;
        setStats({
          fps: Math.round(a.frames / seconds),
          worstMs: Math.round(a.worst),
          dropped: a.dropped,
          frames: a.frames,
        });
        a.frames = 0;
        a.dropped = 0;
        a.worst = 0;
        a.since = now;
      }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active]);

  return stats;
}

export function PerfDiagnostics() {
  const { diagnostics, setDiagnostics, reduceMotion, effectiveDepth, mode } = useMotionPrefs();
  const depthEnabled = useDepthEnabled();
  const stats = useFrameStats(diagnostics);

  if (!diagnostics) return null;

  const healthy = stats.fps === 0 || stats.fps >= TARGET_FPS;

  return (
    <div
      role="status"
      aria-live="off"
      className="fixed bottom-20 right-3 z-[70] w-44 rounded-xl border border-border/70 bg-background/85 p-3 font-mono text-[11px] leading-relaxed shadow-lg backdrop-blur md:bottom-4"
    >
      <div className="flex items-center justify-between gap-2 pb-1.5">
        <span className="flex items-center gap-1.5 font-sans text-xs font-medium text-foreground">
          <Activity className="h-3.5 w-3.5" aria-hidden />
          Diagnostics
        </span>
        <button
          type="button"
          aria-label="Hide performance diagnostics"
          className="text-muted-foreground transition-colors hover:text-foreground"
          onClick={() => setDiagnostics(false)}
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
      <dl className="space-y-0.5 text-muted-foreground">
        <Row label="fps" value={String(stats.fps)} tone={healthy ? "ok" : "bad"} />
        <Row label="worst" value={`${stats.worstMs}ms`} tone={stats.worstMs > 32 ? "bad" : "ok"} />
        <Row label="dropped" value={`${stats.dropped}/${stats.frames}`} tone={stats.dropped > 2 ? "bad" : "ok"} />
        <Row label="depth" value={depthEnabled ? effectiveDepth.toFixed(2) : "off"} tone="ok" />
        <Row label="motion" value={reduceMotion ? "reduced" : mode} tone="ok" />
      </dl>
    </div>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone: "ok" | "bad" }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt>{label}</dt>
      <dd className={cn(tone === "bad" ? "text-destructive" : "text-foreground")}>{value}</dd>
    </div>
  );
}

export default PerfDiagnostics;
