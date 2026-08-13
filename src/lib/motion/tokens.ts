/**
 * Gradr motion language.
 *
 * One shared vocabulary of springs, easings and variants so every surface in
 * the product animates with the same physics. Import from here instead of
 * hand-tuning transitions inside components.
 */
import type { Transition, Variants } from "motion/react";

/* ------------------------------- easings -------------------------------- */

/** Expressive "expo out" — the house easing for entrances. */
export const easeOut = [0.22, 1, 0.36, 1] as const;
/** Symmetric easing for state changes that go both ways. */
export const easeInOut = [0.65, 0, 0.35, 1] as const;

/* ------------------------------- springs -------------------------------- */

/** Snappy, no overshoot. Buttons, toggles, small UI. */
export const springSnappy: Transition = { type: "spring", stiffness: 520, damping: 34, mass: 0.7 };
/** Default product spring. Cards, panels, layout. */
export const springSmooth: Transition = { type: "spring", stiffness: 260, damping: 30, mass: 0.9 };
/** Heavy, cinematic. Hero elements and large surfaces. */
export const springSoft: Transition = { type: "spring", stiffness: 140, damping: 24, mass: 1.1 };
/** Pointer-following parallax. Intentionally lazy. */
export const springPointer: Transition = { type: "spring", stiffness: 110, damping: 20, mass: 0.6 };

/* ------------------------------- durations ------------------------------ */

export const duration = {
  micro: 0.16,
  fast: 0.24,
  base: 0.38,
  slow: 0.6,
  cinematic: 0.9,
} as const;

/* ------------------------------- variants ------------------------------- */

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: duration.slow, ease: easeOut } },
};

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: duration.base, ease: easeOut } },
};

export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.96 },
  show: { opacity: 1, scale: 1, transition: springSmooth },
};

/** Parent container that releases children one after another. */
export const stagger = (childDelay = 0.06, delayChildren = 0): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren: childDelay, delayChildren } },
});

/** Word-level headline reveal. */
export const wordVariants: Variants = {
  hidden: { opacity: 0, y: "0.45em", rotateX: -35 },
  show: {
    opacity: 1,
    y: "0em",
    rotateX: 0,
    transition: { duration: 0.75, ease: easeOut },
  },
};

/** Shared viewport config so scroll reveals trigger consistently. */
export const viewportOnce = { once: true, amount: 0.2, margin: "0px 0px -10% 0px" } as const;

/* --------------------------- extended variants --------------------------- */

export const fadeDown: Variants = {
  hidden: { opacity: 0, y: -14 },
  show: { opacity: 1, y: 0, transition: { duration: duration.base, ease: easeOut } },
};

export const slideInLeft: Variants = {
  hidden: { opacity: 0, x: -28 },
  show: { opacity: 1, x: 0, transition: springSmooth },
};

export const slideInRight: Variants = {
  hidden: { opacity: 0, x: 28 },
  show: { opacity: 1, x: 0, transition: springSmooth },
};

export const popIn: Variants = {
  hidden: { opacity: 0, scale: 0.9 },
  show: { opacity: 1, scale: 1, transition: springSnappy },
};

/** Row inside a staggered list. */
export const listItem: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: duration.fast, ease: easeOut } },
};

/** Route-level transition used by AnimatedPage. */
export const pageTransition: Variants = {
  initial: { opacity: 0, y: 10, scale: 0.995 },
  animate: { opacity: 1, y: 0, scale: 1, transition: { duration: duration.fast, ease: easeOut } },
  exit: { opacity: 0, y: -6, scale: 0.997, transition: { duration: duration.micro, ease: easeOut } },
};

/** Cross-fade-only equivalents used whenever motion is reduced. */
export const reducedFade: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: duration.micro } },
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: duration.micro } },
  exit: { opacity: 0, transition: { duration: duration.micro } },
};

/**
 * Strip every positional/scale channel out of a variant set, keeping opacity
 * and timing. Use when a component needs its own variants but must still
 * honour `prefers-reduced-motion`.
 */
export function toReduced(variants: Variants): Variants {
  const out: Variants = {};
  for (const [state, value] of Object.entries(variants)) {
    if (typeof value !== "object" || value === null) {
      out[state] = value as never;
      continue;
    }
    const v = value as Record<string, unknown>;
    out[state] = {
      opacity: v.opacity ?? 1,
      transition: { duration: duration.micro, ease: easeOut },
    } as never;
  }
  return out;
}
