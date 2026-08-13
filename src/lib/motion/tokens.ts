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
