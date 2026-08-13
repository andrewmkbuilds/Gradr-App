/**
 * Gradr spatial (3D depth) layer.
 *
 * A small set of primitives that give the whole product a consistent sense of
 * physical depth: perspective scenes, pointer-driven parallax layers, hover
 * elevation with dynamic shadows, and scroll-linked scene handoffs.
 *
 * Rules baked in here so callers can't get it wrong:
 *  - every effect is transform/opacity only (GPU friendly, no layout work)
 *  - all motion is spring-damped from the shared tokens in `@/lib/motion`
 *  - depth is automatically disabled for reduced-motion, touch/coarse pointers
 *    and low-power devices — the markup stays identical, it just goes flat
 */
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  motion,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  type MotionValue,
} from "framer-motion";
import { spring } from "@/lib/motion";
import { useMotionPrefs } from "@/hooks/useMotionPrefs";
import { cn } from "@/lib/utils";

/* ----------------------------- capability gate ---------------------------- */

/**
 * True when the device can afford spatial effects AND the user hasn't turned
 * them down. SSR and the first client frame return `false` so nothing renders
 * tilted before hydration decides.
 */
export function useDepthEnabled() {
  const reduce = useReducedMotion();
  const { reduceMotion: userReduce, effectiveDepth } = useMotionPrefs();
  const [capable, setCapable] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    const nav = navigator as Navigator & {
      deviceMemory?: number;
      connection?: { saveData?: boolean };
    };
    const lowPower =
      (nav.hardwareConcurrency !== undefined && nav.hardwareConcurrency <= 4) ||
      (nav.deviceMemory !== undefined && nav.deviceMemory <= 4) ||
      nav.connection?.saveData === true;
    setCapable(finePointer && !lowPower);
  }, []);

  return capable && !reduce && !userReduce && effectiveDepth > 0;
}

/**
 * 0..1 multiplier every depth primitive scales its travel/tilt by.
 * Returns 0 whenever depth is disabled, so callers can multiply blindly.
 */
export function useDepthIntensity() {
  const enabled = useDepthEnabled();
  const { effectiveDepth } = useMotionPrefs();
  return enabled ? effectiveDepth : 0;
}


/* -------------------------------- the scene -------------------------------- */

type SceneCtx = {
  /** Pointer position within the scene, normalised to -1…1. */
  x: MotionValue<number>;
  y: MotionValue<number>;
  enabled: boolean;
};

const SceneContext = createContext<SceneCtx | null>(null);

/**
 * Perspective container. Tracks the pointer once and shares it with every
 * `DepthLayer` inside, so a whole composition moves as one solid object
 * instead of each card doing its own thing.
 */
export function DepthScene({
  children,
  className,
  perspective = 1400,
  /** Max rotation of the scene itself, in degrees. Keep this small. */
  tilt = 4,
}: {
  children: ReactNode;
  className?: string;
  perspective?: number;
  tilt?: number;
}) {
  const enabled = useDepthEnabled();
  const rawX = useMotionValue(0);
  const rawY = useMotionValue(0);
  const x = useSpring(rawX, spring.soft);
  const y = useSpring(rawY, spring.soft);

  const rotateX = useTransform(y, [-1, 1], [tilt, -tilt]);
  const rotateY = useTransform(x, [-1, 1], [-tilt, tilt]);

  const ctx = useMemo<SceneCtx>(() => ({ x, y, enabled }), [x, y, enabled]);

  return (
    <SceneContext.Provider value={ctx}>
      <div
        className={cn("relative", className)}
        style={{ perspective: `${perspective}px` }}
        onPointerMove={
          enabled
            ? (e) => {
                const r = e.currentTarget.getBoundingClientRect();
                rawX.set(((e.clientX - r.left) / r.width) * 2 - 1);
                rawY.set(((e.clientY - r.top) / r.height) * 2 - 1);
              }
            : undefined
        }
        onPointerLeave={
          enabled
            ? () => {
                rawX.set(0);
                rawY.set(0);
              }
            : undefined
        }
      >
        <motion.div
          style={enabled ? { rotateX, rotateY, transformStyle: "preserve-3d" } : undefined}
          className={enabled ? "will-change-transform" : undefined}
        >
          {children}
        </motion.div>
      </div>
    </SceneContext.Provider>
  );
}

/**
 * A plane inside a `DepthScene`. `depth` is roughly "how far toward the viewer"
 * — higher values move faster with the pointer and cast a stronger shadow.
 * Works standalone too (it just stays still without a scene).
 */
export function DepthLayer({
  children,
  className,
  depth = 1,
  /** Horizontal/vertical pointer travel in px at depth 1. */
  travel = 10,
  /** Adds a soft floating shadow scaled by depth. */
  shadow = true,
}: {
  children: ReactNode;
  className?: string;
  depth?: number;
  travel?: number;
  shadow?: boolean;
}) {
  const scene = useContext(SceneContext);
  const enabled = scene?.enabled ?? false;

  const zero = useMotionValue(0);
  const sx = scene?.x ?? zero;
  const sy = scene?.y ?? zero;
  const x = useTransform(sx, [-1, 1], [-travel * depth, travel * depth]);
  const y = useTransform(sy, [-1, 1], [-travel * depth * 0.7, travel * depth * 0.7]);

  return (
    <motion.div
      className={cn(shadow && enabled && "depth-shadow", className)}
      style={
        enabled
          ? {
              x,
              y,
              translateZ: depth * 26,
              transformStyle: "preserve-3d",
              ["--depth" as string]: depth,
            }
          : undefined
      }
    >
      {children}
    </motion.div>
  );
}

/* ------------------------------- depth card ------------------------------- */

/**
 * Self-contained 3D card: pointer tilt around its own centre, hover lift,
 * a light sheen that tracks the cursor, and a shadow that deepens on hover.
 * Deliberately subtle — 5° max — so it reads premium, not gimmicky.
 */
export function DepthCard({
  children,
  className,
  innerClassName,
  tilt = 5,
  lift = 6,
  sheen = true,
}: {
  children: ReactNode;
  className?: string;
  innerClassName?: string;
  tilt?: number;
  lift?: number;
  sheen?: boolean;
}) {
  const enabled = useDepthEnabled();
  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const hover = useMotionValue(0);

  const rotateX = useSpring(useTransform(py, [0, 1], [tilt, -tilt]), spring.soft);
  const rotateY = useSpring(useTransform(px, [0, 1], [-tilt, tilt]), spring.soft);
  const z = useSpring(useTransform(hover, [0, 1], [0, lift]), spring.smooth);
  const sheenX = useTransform(px, [0, 1], ["0%", "100%"]);
  const sheenY = useTransform(py, [0, 1], ["0%", "100%"]);
  const sheenBg = useMotionTemplate`radial-gradient(55% 55% at ${sheenX} ${sheenY}, hsl(0 0% 100% / 0.14), transparent 70%)`;
  const sheenOpacity = useSpring(hover, spring.smooth);
  const yLift = useTransform(z, (v) => -v);

  if (!enabled) return <div className={cn(className, innerClassName)}>{children}</div>;

  return (
    <div className={cn("[perspective:1100px]", className)}>
      <motion.div
        className={cn("relative will-change-transform", innerClassName)}
        style={{ rotateX, rotateY, y: yLift, transformStyle: "preserve-3d" }}
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          px.set((e.clientX - r.left) / r.width);
          py.set((e.clientY - r.top) / r.height);
        }}
        onPointerEnter={() => hover.set(1)}
        onPointerLeave={() => {
          hover.set(0);
          px.set(0.5);
          py.set(0.5);
        }}
      >
        {children}
        {sheen && (
          <motion.span
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-[inherit] mix-blend-soft-light"
            style={{ background: sheenBg, opacity: sheenOpacity }}
          />
        )}
      </motion.div>
    </div>
  );
}

/* ----------------------------- floating panel ----------------------------- */

/** Slow idle drift, as if the panel is suspended in space. */
export function FloatingPanel({
  children,
  className,
  amplitude = 6,
  duration = 7,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  amplitude?: number;
  duration?: number;
  delay?: number;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={cn("will-change-transform", className)}
      animate={reduce ? undefined : { y: [-amplitude, amplitude, -amplitude] }}
      transition={{ duration, repeat: Infinity, ease: "easeInOut", delay }}
    >
      {children}
    </motion.div>
  );
}

/* ------------------------------ scroll scene ------------------------------ */

/**
 * Scroll-linked handoff: as the section leaves the viewport it recedes into
 * the page (slight rotateX + scale + fade) instead of just scrolling away.
 */
export function ScrollDepthOut({
  children,
  className,
  rotate = 6,
  scale = 0.94,
}: {
  children: ReactNode;
  className?: string;
  rotate?: number;
  scale?: number;
}) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const rotateX = useTransform(scrollYProgress, [0, 1], [0, rotate]);
  const s = useTransform(scrollYProgress, [0, 1], [1, scale]);
  const opacity = useTransform(scrollYProgress, [0, 0.75, 1], [1, 1, 0.35]);

  return (
    <div ref={ref} className={cn("[perspective:1600px]", className)}>
      <motion.div
        style={reduce ? undefined : { rotateX, scale: s, opacity, transformOrigin: "50% 0%" }}
        className="will-change-transform"
      >
        {children}
      </motion.div>
    </div>
  );
}
