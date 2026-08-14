import { useSyncExternalStore } from "react";

/**
 * Pointer capability hooks.
 *
 * Premium pointer choreography (tilt, spotlight, magnetic drift, hover
 * reveals) is mouse-only. On touch devices those effects either never fire or
 * fire once and stick, so surfaces read as broken. Components ask these hooks
 * what the device can actually do and swap in a touch-native behaviour —
 * press feedback and always-visible affordances — instead.
 */

function subscribeToQuery(query: string) {
  return (onChange: () => void) => {
    if (typeof window === "undefined" || !window.matchMedia) return () => {};
    const mq = window.matchMedia(query);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  };
}

function useMediaQuery(query: string, serverValue: boolean): boolean {
  return useSyncExternalStore(
    subscribeToQuery(query),
    () => (typeof window !== "undefined" && window.matchMedia ? window.matchMedia(query).matches : serverValue),
    () => serverValue,
  );
}

/** True on touch-first devices (phones, tablets, most kiosks). */
export function useCoarsePointer(): boolean {
  return useMediaQuery("(pointer: coarse)", false);
}

/** True when the device can genuinely hover — i.e. hover styling is safe. */
export function useHoverCapable(): boolean {
  return useMediaQuery("(hover: hover) and (pointer: fine)", true);
}

/** True below the `md` breakpoint. Used to trim animation complexity. */
export function useCompactViewport(): boolean {
  return useMediaQuery("(max-width: 767px)", false);
}

/**
 * One answer for "should this surface run expensive pointer choreography?".
 * Combines hover capability with viewport size so a narrow desktop window
 * behaves like the phone layout it visually is.
 */
export function usePremiumInteractions(): boolean {
  const hover = useHoverCapable();
  const compact = useCompactViewport();
  return hover && !compact;
}
