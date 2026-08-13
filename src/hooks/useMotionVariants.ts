import { useMemo } from "react";
import type { Transition, Variants } from "motion/react";
import { useReducedMotionPref } from "@/hooks/useMotionPreference";
import { duration, easeOut, stagger, toReduced } from "@/lib/motion/tokens";

/**
 * Wraps any variant set so it automatically degrades to a cross-fade when the
 * user has motion reduced (in-app toggle or OS setting).
 */
export function useMotionVariants(variants: Variants): Variants {
  const reduced = useReducedMotionPref();
  return useMemo(() => (reduced ? toReduced(variants) : variants), [reduced, variants]);
}

/** Reduced-aware stagger container. Children arrive instantly when reduced. */
export function useStagger(childDelay = 0.06, delayChildren = 0): Variants {
  const reduced = useReducedMotionPref();
  return useMemo(
    () => (reduced ? stagger(0, 0) : stagger(childDelay, delayChildren)),
    [reduced, childDelay, delayChildren],
  );
}

/** Reduced-aware transition: keeps the shape, drops the physics. */
export function useTransitionPref(transition: Transition): Transition {
  const reduced = useReducedMotionPref();
  return useMemo(
    () => (reduced ? { duration: duration.micro, ease: easeOut } : transition),
    [reduced, transition],
  );
}
