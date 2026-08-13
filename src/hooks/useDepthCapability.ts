import { useEffect, useState } from "react";
import { useReducedMotionPref } from "@/hooks/useMotionPreference";

export type DepthLevel = "off" | "lite" | "full";

interface NavigatorWithHints extends Navigator {
  deviceMemory?: number;
  connection?: { saveData?: boolean };
}

function detect(): DepthLevel {
  if (typeof window === "undefined") return "lite";
  const nav = navigator as NavigatorWithHints;
  const coarse = window.matchMedia?.("(pointer: coarse)").matches ?? false;
  const narrow = window.innerWidth < 768;
  const lowCores = (nav.hardwareConcurrency ?? 8) <= 4;
  const lowMemory = (nav.deviceMemory ?? 8) <= 4;
  const saveData = nav.connection?.saveData === true;

  if (saveData) return "off";
  if (coarse || narrow || lowCores || lowMemory) return "lite";
  return "full";
}

/**
 * How much spatial depth this device should render.
 *
 * `full`  — pointer tilt, layered translateZ parallax, dynamic shadows.
 * `lite`  — static depth (shadows, layering) but no pointer/scroll 3D work.
 * `off`   — flat surfaces only (reduced motion, data saver).
 *
 * Always resolves to `off` when the user has motion reduced, so the whole 3D
 * layer degrades from a single switch.
 */
export function useDepthCapability(): DepthLevel {
  const reduced = useReducedMotionPref();
  const [level, setLevel] = useState<DepthLevel>("lite");

  useEffect(() => {
    const update = () => setLevel(detect());
    update();
    window.addEventListener("resize", update, { passive: true });
    return () => window.removeEventListener("resize", update);
  }, []);

  if (reduced) return "off";
  return level;
}

/** Convenience: is pointer-driven 3D allowed right now? */
export function useSpatialPointer(): boolean {
  return useDepthCapability() === "full";
}
