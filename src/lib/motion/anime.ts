/**
 * Anime.js layer for Gradr.
 *
 * Motion.dev (`motion/react`) stays the library for declarative component
 * motion. Anime.js is used only where an animation is *imperative and
 * attribute-level* — SVG geometry, numeric attribute tweens, precise
 * timelines — where React re-renders would be wasteful.
 *
 * Durations and easings mirror `src/lib/motion/tokens.ts` (which are in
 * seconds) so both libraries speak the same motion language.
 */
import { duration as motionDuration } from "./tokens";

/** Anime.js works in milliseconds; the shared tokens are in seconds. */
export const animeDuration = {
  micro: motionDuration.micro * 1000,
  fast: motionDuration.fast * 1000,
  base: motionDuration.base * 1000,
  slow: motionDuration.slow * 1000,
  cinematic: motionDuration.cinematic * 1000,
} as const;

/** House easings, expressed in Anime.js' easing syntax. */
export const animeEase = {
  /** Entrances — matches `easeOut` (expo-out feel). */
  out: "cubicBezier(0.22, 1, 0.36, 1)",
  /** Reversible state changes — matches `easeInOut`. */
  inOut: "cubicBezier(0.65, 0, 0.35, 1)",
  /** Snappy UI feedback (buttons, toggles). */
  snappy: "cubicBezier(0.34, 1.4, 0.44, 1)",
  linear: "linear",
} as const;

export type AnimeDurationToken = keyof typeof animeDuration;
export type AnimeEaseToken = keyof typeof animeEase;

export function resolveDuration(value: number | AnimeDurationToken | undefined, fallback = animeDuration.base) {
  if (value === undefined) return fallback;
  return typeof value === "number" ? value : animeDuration[value];
}

export function resolveEase(value: string | AnimeEaseToken | undefined, fallback = animeEase.out) {
  if (!value) return fallback;
  return (animeEase as Record<string, string>)[value] ?? value;
}
