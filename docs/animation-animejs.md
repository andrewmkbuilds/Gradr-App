# Anime.js in Gradr

Gradr has two motion libraries with strictly separate jobs.

| Use | Library |
| --- | --- |
| Component enter/exit, layout, gestures, shared variants | **Motion.dev** (`motion/react`) |
| Imperative attribute/SVG tweens, precise timelines, numeric counters on DOM nodes | **Anime.js** (`animejs` v4) via `useAnime` |

If a Motion.dev variant can express the animation, use Motion.dev. Reach for
Anime.js only when you need to drive raw attributes (`stroke-dashoffset`,
`d`, `viewBox`, `transform` on SVG children) or an orchestrated timeline that
should not cause React re-renders.

## The wrappers

```tsx
import { useAnime } from "@/hooks/useAnime";

const ring = useAnime<SVGCircleElement>(
  { strokeDashoffset: [circumference, offset] },
  { duration: "slow", ease: "out", deps: [offset] },
);

return <circle ref={ring} … />;
```

- `useAnime(params, options)` returns a ref. The animation runs in a layout
  effect (client-only — it never executes during SSR or in a test renderer
  without a DOM), re-runs when `options.deps` change, and is cleaned up on
  unmount.
- `options.when: false` skips the animation entirely (e.g. while data is
  still loading).
- `<Anime>` (`@/components/motion/Anime`) is the declarative form for a single
  element wrapper.

## Recommended durations and easings

Tokens come from `@/lib/motion/anime` and mirror `@/lib/motion/tokens`, so
Motion.dev and Anime.js stay visually consistent.

| Token | ms | Use for |
| --- | --- | --- |
| `micro` | 160 | Icon/state flips, checkbox ticks |
| `fast` | 240 | Hover feedback, small reveals |
| `base` | 380 | Panel expand/collapse, default |
| `slow` | 600 | Progress rings, score dials |
| `cinematic` | 900 | Hero-scale reveals only |

Easings: `out` for entrances (default), `inOut` for reversible state, `snappy`
for tactile UI feedback, `linear` only for continuous loops.

Never animate longer than 900 ms in product surfaces, and never animate
layout-affecting properties (`width`, `top`, `height`) when a transform can
do the same job.

## Accessibility

`useAnime` honours `useReducedMotionPref()` — the in-app motion toggle *and*
the OS `prefers-reduced-motion` setting. When motion is reduced:

- No tween runs. The hook applies the animation's **end state immediately**,
  so reduced-motion users still see the correct final value (a full progress
  ring, an expanded panel) rather than an unanimated initial state.
- Loops and infinite animations are skipped entirely.

Do not call `animate()` from `animejs` directly in components — bypassing the
hook bypasses the reduced-motion contract. Anything decorative and looping
must additionally be safe to remove: it should carry no information.

## Client-only guarantees

`animejs` touches `document` at call time. `useAnime` only imports the runtime
inside an effect and no-ops when `typeof window === "undefined"`, so the
bundle is safe for prerendering and for the jsdom test environment.
