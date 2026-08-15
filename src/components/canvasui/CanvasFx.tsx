/**
 * Gated, lazy wrappers around the Canvas UI effects.
 *
 * Every Gradr surface talks to these instead of importing a Canvas UI
 * component directly, so the whole landing page shares one set of rules:
 *
 *  - the heavy WebGL module is only ever fetched when the device can run it
 *  - it only mounts once the slot scrolls near the viewport
 *  - it unmounts (releasing the GL context) once well out of view
 *  - reduced motion, small screens, save-data and low-power devices get the
 *    plain DOM, which is always the real content
 *
 * The children passed in are the actual, interactive, accessible markup. If
 * the canvas layer never loads — unsupported browser, failed chunk, lost GL
 * context — the page renders exactly as it would have without any of this.
 */

import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

import { cn } from "@/lib/utils";
import { useReducedMotionPref } from "@/hooks/useMotionPreference";
import {
  resolveCanvasFxTier,
  tierSatisfies,
  type CanvasFxDemand,
  type CanvasFxTier,
} from "@/lib/canvasui/capability";

import type { HexFloatOptions } from "./HexFloat";
import type { ParticleScrollOptions } from "./ParticleScroll";
import type { PeelOptions } from "./Peel";

const LazyHexFloat = lazy(() =>
  import("./HexFloat").then((m) => ({ default: m.HexFloat })),
);
const LazyParticleScroll = lazy(() =>
  import("./ParticleScroll").then((m) => ({ default: m.ParticleScroll })),
);
const LazyPeel = lazy(() => import("./Peel").then((m) => ({ default: m.Peel })));

/** Mount a little before the slot arrives, unmount once it is clearly gone. */
const MOUNT_MARGIN = "300px 0px";

interface SlotState {
  /** Whether the environment allows this slot to run at all. */
  enabled: boolean;
  /** Resolved budget, for per-tier option tuning. */
  tier: CanvasFxTier;
  /** Whether the slot is near enough to the viewport to be mounted. */
  near: boolean;
}

/**
 * Resolve the tier for a slot and track whether it is near the viewport.
 *
 * `enabled` is settled synchronously on first render so a slot's reserved
 * height never changes after paint — the effect swaps in underneath a box
 * that was already the right size, which keeps CLS at zero.
 */
function useCanvasFxSlot(demand: CanvasFxDemand) {
  const reducedMotion = useReducedMotionPref();
  const ref = useRef<HTMLDivElement | null>(null);

  const compute = useCallback((): boolean => {
    if (typeof window === "undefined") return false;
    return tierSatisfies(
      resolveCanvasFxTier({ reducedMotion, width: window.innerWidth }),
      demand,
    );
  }, [demand, reducedMotion]);

  const [state, setState] = useState<SlotState>(() => {
    if (typeof window === "undefined") {
      return { enabled: false, tier: "off", near: false };
    }
    const tier = resolveCanvasFxTier({ reducedMotion, width: window.innerWidth });
    return { enabled: tierSatisfies(tier, demand), tier, near: false };
  });

  // Re-resolve when the motion preference flips or the viewport crosses a
  // breakpoint. Debounced so a drag-resize does not thrash GL contexts.
  useEffect(() => {
    let frame = 0;
    const sync = () => {
      window.clearTimeout(frame);
      frame = window.setTimeout(() => {
        const tier = resolveCanvasFxTier({
          reducedMotion,
          width: window.innerWidth,
        });
        setState((prev) => {
          const enabled = tierSatisfies(tier, demand);
          if (prev.enabled === enabled && prev.tier === tier) return prev;
          return { ...prev, enabled, tier };
        });
      }, 200);
    };
    sync();
    window.addEventListener("resize", sync, { passive: true });
    return () => {
      window.clearTimeout(frame);
      window.removeEventListener("resize", sync);
    };
  }, [demand, reducedMotion, compute]);

  // Only mount the effect around the viewport. Canvas UI pauses its own loop
  // offscreen; unmounting goes further and frees the GL context outright.
  useEffect(() => {
    const node = ref.current;
    if (!node || !state.enabled) return;
    if (typeof IntersectionObserver === "undefined") {
      setState((prev) => ({ ...prev, near: true }));
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        const near = entries[entries.length - 1]?.isIntersecting ?? false;
        setState((prev) => (prev.near === near ? prev : { ...prev, near }));
      },
      { rootMargin: MOUNT_MARGIN },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [state.enabled]);

  return { ref, ...state, active: state.enabled && state.near };
}

interface BaseFxProps {
  children: ReactNode;
  className?: string;
  /**
   * Extra classes applied only when the effect is allowed to run. This is
   * where the reserved height goes: html-in-canvas hosts the children inside
   * an absolutely positioned canvas, which would collapse the container, so
   * canvas mode needs an explicit box. Everyone else keeps the untouched
   * intrinsic layout.
   *
   * Safe for CLS because the enabled/disabled decision is made synchronously
   * on first render — the box never resizes after paint.
   */
  activeClassName?: string;
  style?: CSSProperties;
}

/** Shared shell: reserves the box and hosts either mode. */
function FxShell({
  innerRef,
  className,
  style,
  children,
}: Omit<BaseFxProps, "activeClassName"> & {
  innerRef: React.Ref<HTMLDivElement>;
}) {
  return (
    <div ref={innerRef} className={className} style={style}>
      {children}
    </div>
  );
}

/* -------------------------------- HexFloat -------------------------------- */

export interface HexFloatFxProps extends BaseFxProps {
  options?: HexFloatOptions;
  /** Options merged in on the tablet ("lite") tier. */
  liteOptions?: HexFloatOptions;
}

/**
 * Renders its children onto a floor of beveled hex tiles that lean into
 * perspective and rise toward the cursor. Desktop only — the hero mock stays
 * flat HTML everywhere else.
 */
export function HexFloatFx({
  children,
  options,
  liteOptions,
  className,
  activeClassName,
  style,
}: HexFloatFxProps) {
  const { ref, active, enabled, tier } = useCanvasFxSlot("full");
  const resolved = tier === "lite" ? { ...options, ...liteOptions } : options;

  return (
    <FxShell
      innerRef={ref}
      className={cn(className, enabled && activeClassName)}
      style={style}
    >
      {active ? (
        <Suspense fallback={children}>
          <LazyHexFloat {...resolved} style={{ width: "100%", height: "100%" }}>
            {children}
          </LazyHexFloat>
        </Suspense>
      ) : (
        children
      )}
    </FxShell>
  );
}

/**
 * Whether a slot of the given demand will actually run its effect here.
 * Lets callers tailor affordance copy — telling someone to "peel" a sheet
 * that is rendering as a static comparison is worse than saying nothing.
 */
export function useCanvasFxEnabled(demand: CanvasFxDemand): boolean {
  const reducedMotion = useReducedMotionPref();
  const [enabled, setEnabled] = useState(() =>
    typeof window === "undefined"
      ? false
      : tierSatisfies(
          resolveCanvasFxTier({ reducedMotion, width: window.innerWidth }),
          demand,
        ),
  );

  useEffect(() => {
    const sync = () =>
      setEnabled(
        tierSatisfies(
          resolveCanvasFxTier({ reducedMotion, width: window.innerWidth }),
          demand,
        ),
      );
    sync();
    window.addEventListener("resize", sync, { passive: true });
    return () => window.removeEventListener("resize", sync);
  }, [demand, reducedMotion]);

  return enabled;
}

/* ----------------------------- ParticleScroll ----------------------------- */

export interface ParticleScrollFxProps extends BaseFxProps {
  options?: ParticleScrollOptions;
  liteOptions?: ParticleScrollOptions;
}

/**
 * Dissolves its children into drifting particles below a formation line; they
 * reassemble into crisp UI as the section scrolls up.
 */
export function ParticleScrollFx({
  children,
  options,
  liteOptions,
  className,
  activeClassName,
  style,
}: ParticleScrollFxProps) {
  const { ref, active, enabled, tier } = useCanvasFxSlot("lite");
  const resolved = tier === "lite" ? { ...options, ...liteOptions } : options;

  return (
    <FxShell
      innerRef={ref}
      className={cn(className, enabled && activeClassName)}
      style={style}
    >
      {active ? (
        <Suspense fallback={children}>
          <LazyParticleScroll
            {...resolved}
            style={{ width: "100%", height: "100%" }}
          >
            {children}
          </LazyParticleScroll>
        </Suspense>
      ) : (
        children
      )}
    </FxShell>
  );
}

/* ---------------------------------- Peel ---------------------------------- */

export interface PeelFxProps extends BaseFxProps {
  /** Layer revealed underneath the peel. */
  under: ReactNode;
  /**
   * Rendered when the peel cannot run. Must expose the same information as
   * `under` through ordinary, keyboard-reachable HTML — Canvas UI drops the
   * under layer entirely in its fallback path, so we supply our own.
   */
  fallback: ReactNode;
  options?: PeelOptions;
  liteOptions?: PeelOptions;
}

/**
 * Peels its children back from an edge as the cursor approaches, revealing
 * `under`. When the effect cannot run, `fallback` is rendered instead of the
 * children so the comparison is never lost.
 */
export function PeelFx({
  children,
  under,
  fallback,
  options,
  liteOptions,
  className,
  activeClassName,
  style,
}: PeelFxProps) {
  const { ref, active, enabled, tier } = useCanvasFxSlot("full");
  const resolved = tier === "lite" ? { ...options, ...liteOptions } : options;

  return (
    <FxShell
      innerRef={ref}
      className={cn(className, enabled && activeClassName)}
      style={style}
    >
      {enabled ? (
        active ? (
          <Suspense fallback={children}>
            <LazyPeel
              {...resolved}
              under={under}
              style={{ width: "100%", height: "100%" }}
            >
              {children}
            </LazyPeel>
          </Suspense>
        ) : (
          children
        )
      ) : (
        fallback
      )}
    </FxShell>
  );
}
