import { useEffect, useState } from "react";
import { useDepthCapability } from "@/hooks/useDepthCapability";
import { useReducedMotionPref } from "@/hooks/useMotionPreference";
import { useCoarsePointer, useCompactViewport, useHoverCapable } from "@/hooks/usePointerCapability";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "gradr-depth-debug";

/**
 * Temporary developer overlay: shows the resolved depth capability, the
 * reduced-motion state and the pointer hints that produced them, so cursor
 * behaviour can be validated at a glance across devices.
 *
 * Visible only in dev builds, or on any build with `?debug=depth` in the URL
 * (the choice sticks for the session via localStorage; `?debug=off` clears it).
 */
export function DepthDebugOverlay({ className }: { className?: string }) {
  const [enabled, setEnabled] = useState(false);
  const depth = useDepthCapability();
  const reduced = useReducedMotionPref();
  const coarse = useCoarsePointer();
  const hover = useHoverCapable();
  const compact = useCompactViewport();
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const flag = params.get("debug");
    if (flag === "off") {
      localStorage.removeItem(STORAGE_KEY);
      setEnabled(false);
      return;
    }
    if (flag === "depth") localStorage.setItem(STORAGE_KEY, "1");
    setEnabled(import.meta.env.DEV || localStorage.getItem(STORAGE_KEY) === "1");
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    onResize();
    window.addEventListener("resize", onResize, { passive: true });
    return () => window.removeEventListener("resize", onResize);
  }, [enabled]);

  if (!enabled) return null;

  const rows: Array<[string, string]> = [
    ["depth", depth],
    ["reduced motion", reduced ? "on" : "off"],
    ["pointer", coarse ? "coarse" : hover ? "fine + hover" : "fine"],
    ["viewport", `${size.w}×${size.h}${compact ? " (compact)" : ""}`],
    ["cursor fx", depth === "full" && !compact ? "mounted" : "not mounted"],
  ];

  return (
    <div
      data-depth-debug="true"
      className={cn(
        "pointer-events-none fixed bottom-4 left-4 z-50 rounded-card border border-border bg-surface/90 p-3 shadow-raise backdrop-blur",
        className,
      )}
    >
      <p className="text-overline text-muted-foreground">Depth debug</p>
      <dl className="mt-2 grid grid-cols-[auto_auto] gap-x-4 gap-y-1">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-caption text-muted-foreground">{label}</dt>
            <dd data-debug-field={label.replace(/\s+/g, "-")} className="text-caption text-foreground">
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export default DepthDebugOverlay;
