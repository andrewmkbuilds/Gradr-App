import { useEffect, useRef } from "react";
import { animate, utils, type JSAnimation } from "animejs";
import { useReducedMotionPref } from "@/hooks/useMotionPreference";
import {
  resolveDuration,
  resolveEase,
  type AnimeDurationToken,
  type AnimeEaseToken,
} from "@/lib/motion/anime";

/** Animatable properties, e.g. `{ opacity: [0, 1], strokeDashoffset: 120 }`. */
export type AnimeParams = Record<string, unknown>;

export interface UseAnimeOptions {
  duration?: number | AnimeDurationToken;
  ease?: string | AnimeEaseToken;
  delay?: number;
  loop?: boolean | number;
  alternate?: boolean;
  autoplay?: boolean;
  /** Re-run the animation when any of these change. */
  deps?: unknown[];
  /** Skip the animation entirely (e.g. while data is loading). */
  when?: boolean;
  onComplete?: () => void;
}

/** Final value of a tween definition — used as the reduced-motion end state. */
function endStateOf(params: AnimeParams): Record<string, unknown> {
  const end: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      const last = value[value.length - 1];
      end[key] = last && typeof last === "object" && "value" in (last as object)
        ? (last as { value: unknown }).value
        : last;
    } else if (value && typeof value === "object" && "to" in (value as object)) {
      end[key] = (value as { to: unknown }).to;
    } else {
      end[key] = value;
    }
  }
  return end;
}

/**
 * Run an Anime.js animation on a single element, safely.
 *
 * - Client-only: the tween starts in an effect, never during render/SSR.
 * - Reduced-motion aware: applies the end state instantly instead of tweening.
 * - Self-cleaning: the animation is cancelled on unmount and before re-runs.
 *
 * See `docs/animation-animejs.md` for when to use this over Motion.dev.
 */
export function useAnime<T extends Element = HTMLElement>(
  params: AnimeParams,
  options: UseAnimeOptions = {},
) {
  const ref = useRef<T | null>(null);
  const reduced = useReducedMotionPref();
  const paramsRef = useRef(params);
  paramsRef.current = params;
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const {
    duration,
    ease,
    delay,
    loop,
    alternate,
    autoplay = true,
    when = true,
    deps = [],
  } = options;

  useEffect(() => {
    const target = ref.current;
    if (!target || typeof window === "undefined") return;
    if (when === false) return;

    const tween = paramsRef.current;

    // Reduced motion: land on the final value immediately, skip loops.
    if (reduced) {
      try {
        utils.set(target as never, endStateOf(tween) as never);
      } catch {
        /* non-animatable target — nothing to do */
      }
      optionsRef.current.onComplete?.();
      return;
    }

    let animation: JSAnimation | undefined;
    try {
      animation = animate(target as never, {
        ...tween,
        duration: resolveDuration(duration),
        ease: resolveEase(ease),
        delay: delay ?? 0,
        loop: loop ?? false,
        alternate: alternate ?? false,
        autoplay,
        onComplete: () => optionsRef.current.onComplete?.(),
      } as never);
    } catch (error) {
      // Never let a decorative animation break a product surface.
      console.warn("useAnime: animation failed", error);
      return;
    }

    return () => {
      animation?.revert?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced, when, duration, ease, delay, loop, alternate, autoplay, ...deps]);

  return ref;
}
