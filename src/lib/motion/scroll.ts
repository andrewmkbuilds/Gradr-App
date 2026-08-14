/**
 * Motion-aware scrolling.
 *
 * Reads the single source of truth for reduced motion (`html[data-motion]`,
 * written by MotionPreferenceProvider from the in-app toggle + the OS
 * `prefers-reduced-motion` setting) so imperative scrolls degrade exactly like
 * Motion animations do. Smooth scrolling is preserved for everyone else.
 */

/** Resolved reduced-motion state, usable outside React. */
export function prefersReducedMotion(): boolean {
  if (typeof document === "undefined") return false;
  const attr = document.documentElement.dataset.motion;
  if (attr === "reduced") return true;
  if (attr === "full") return false;
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;
}

/** "auto" when motion is reduced, otherwise "smooth". */
export function scrollBehavior(): ScrollBehavior {
  return prefersReducedMotion() ? "auto" : "smooth";
}

/** Scrolls an element (or element id) into view, honouring reduced motion. */
export function scrollIntoViewSafely(
  target: Element | string | null | undefined,
  options: Omit<ScrollIntoViewOptions, "behavior"> = { block: "start" },
) {
  const el = typeof target === "string" ? document.getElementById(target) : target;
  el?.scrollIntoView({ ...options, behavior: scrollBehavior() });
}

/** window/element scrollTo that honours reduced motion. */
export function scrollToSafely(
  options: Omit<ScrollToOptions, "behavior">,
  container: Element | Window = typeof window !== "undefined" ? window : (undefined as never),
) {
  container?.scrollTo({ ...options, behavior: scrollBehavior() });
}
