/**
 * Gradr unified motion system.
 *
 * Single source of truth for springs, easing curves, durations and shared
 * variants used by every animated surface (pages, layouts, cards, headlines).
 * Never hardcode a duration or cubic-bezier in a component — import from here
 * so the whole product moves with one physical language.
 *
 * All consumers must respect `prefers-reduced-motion`: use the `useReducedMotion`
 * hook from framer-motion, or `reducedVariants` below, to collapse movement to a
 * plain opacity change.
 */

/** Easing curves. `standard` is the house curve (fast out, soft settle). */
export const ease = {
  standard: [0.22, 1, 0.36, 1] as const,
  entrance: [0.16, 1, 0.3, 1] as const,
  exit: [0.4, 0, 1, 1] as const,
  inOut: [0.65, 0, 0.35, 1] as const,
};

/** Spring presets — physical, never bouncy enough to feel toy-like. */
export const spring = {
  /** Snappy UI feedback: toggles, presses, hovers. */
  snappy: { type: "spring", stiffness: 520, damping: 34, mass: 0.7 },
  /** Default surface motion: cards, panels, page content. */
  smooth: { type: "spring", stiffness: 260, damping: 30, mass: 0.9 },
  /** Soft, weighty motion for large elements and parallax. */
  soft: { type: "spring", stiffness: 120, damping: 22, mass: 1.1 },
  /** Layout / shared-element transitions. */
  layout: { type: "spring", stiffness: 320, damping: 34, mass: 0.8 },
} as const;

export const duration = {
  fast: 0.18,
  base: 0.28,
  slow: 0.45,
  scene: 0.7,
} as const;

export const stagger = {
  tight: 0.035,
  base: 0.06,
  loose: 0.1,
} as const;

/* -------------------------------- variants -------------------------------- */

export const pageVariants = {
  initial: { opacity: 0, y: 12, scale: 0.995, filter: "blur(4px)" },
  animate: { opacity: 1, y: 0, scale: 1, filter: "blur(0px)" },
  exit: { opacity: 0, y: -8, scale: 0.997, filter: "blur(3px)" },
};

export const reducedPageVariants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};

export const fadeUp = {
  initial: { opacity: 0, y: 18 },
  animate: { opacity: 1, y: 0 },
};

export const fadeIn = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
};

export const scaleIn = {
  initial: { opacity: 0, scale: 0.96 },
  animate: { opacity: 1, scale: 1 },
};

/** Parent container that staggers its `StaggerItem` children. */
export const staggerContainer = (delay = 0, step: number = stagger.base) => ({
  initial: {},
  animate: { transition: { delayChildren: delay, staggerChildren: step } },
});

/** Per-letter / per-word headline reveal. */
export const headlineWord = {
  initial: { opacity: 0, y: "0.6em", rotateX: -55 },
  animate: { opacity: 1, y: "0em", rotateX: 0 },
};

export const pageTransition = { duration: duration.base, ease: ease.standard };
export const contentTransition = { duration: duration.slow, ease: ease.entrance };
