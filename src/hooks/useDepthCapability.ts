import { useEffect, useSyncExternalStore } from "react";
import { useReducedMotionPref } from "@/hooks/useMotionPreference";
import { depthManager, type DepthLevel } from "@/lib/motion/depthManager";

export type { DepthLevel };

/**
 * How much spatial depth this device should render right now.
 *
 * `full`  — pointer tilt, layered translateZ parallax, dynamic shadows.
 * `lite`  — static depth (shadows, layering) but no pointer/scroll 3D work.
 * `off`   — flat surfaces only (reduced motion, data saver, low frame rate).
 *
 * Backed by the runtime depth manager, so a device that starts dropping frames
 * — or a user who turns motion off — flattens every spatial surface at once.
 */
export function useDepthCapability(): DepthLevel {
  const reduced = useReducedMotionPref();

  useEffect(() => {
    depthManager.setReducedMotion(reduced);
  }, [reduced]);

  const level = useSyncExternalStore(
    depthManager.subscribe,
    () => depthManager.getLevel(),
    () => "lite" as DepthLevel,
  );

  return reduced ? "off" : level;
}

/** Convenience: is pointer-driven 3D allowed right now? */
export function useSpatialPointer(): boolean {
  return useDepthCapability() === "full";
}
