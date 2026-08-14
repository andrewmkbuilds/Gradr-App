import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  motion,
  useMotionTemplate,
  useMotionValue,
  useScroll,
  useSpring,
  useTransform,
  type MotionValue,
} from "motion/react";
import { springPointer } from "@/lib/motion/tokens";
import { useDepthCapability } from "@/hooks/useDepthCapability";
import { cn } from "@/lib/utils";

/* --------------------------------- context -------------------------------- */

interface StageValue {
  /** Pointer position normalised to [-1, 1] across the stage. */
  mx: MotionValue<number>;
  my: MotionValue<number>;
  active: boolean;
}

const StageContext = createContext<StageValue | null>(null);

const zero = { mx: null, my: null } as const;

/* -------------------------------- DepthStage ------------------------------- */

type StageProps = {
  children: ReactNode;
  className?: string;
  /** Max tilt in degrees at the edges. */
  tilt?: number;
  /** Perspective distance in px. Larger = softer 3D. */
  perspective?: number;
  /** Cursor-tracking sheen across the surface. */
  sheen?: boolean;
  /** Light-reactive hairline along the top edge. */
  edgeLight?: boolean;
  /** Shadow that shifts with the tilt. */
  dynamicShadow?: boolean;
};

/**
 * A spatial stage. Establishes perspective, tilts toward the pointer with
 * spring physics, and publishes the pointer position so nested `DepthLayer`s
 * can parallax at their own rate.
 *
 * Only transforms and opacity animate, so the whole thing stays on the
 * compositor. Degrades to a plain box when depth is reduced.
 */
export function DepthStage({
  children,
  className,
  tilt = 7,
  perspective = 1200,
  sheen = true,
  edgeLight = true,
  dynamicShadow = true,
}: StageProps) {
  const depth = useDepthCapability();
  const ref = useRef<HTMLDivElement>(null);
  const rawX = useMotionValue(0);
  const rawY = useMotionValue(0);
  const mx = useSpring(rawX, springPointer);
  const my = useSpring(rawY, springPointer);

  const rotateY = useTransform(mx, [-1, 1], [tilt, -tilt]);
  const rotateX = useTransform(my, [-1, 1], [-tilt * 0.8, tilt * 0.8]);
  const shadowX = useTransform(mx, [-1, 1], [26, -26]);
  const shadowY = useTransform(my, [-1, 1], [-8, 30]);
  const boxShadow = useMotionTemplate`${shadowX}px ${shadowY}px 60px -32px hsl(var(--foreground) / 0.45)`;
  const sheenX = useTransform(mx, [-1, 1], [12, 88]);
  const sheenY = useTransform(my, [-1, 1], [10, 90]);
  const sheenBg = useMotionTemplate`radial-gradient(520px circle at ${sheenX}% ${sheenY}%, hsl(var(--primary) / 0.14), transparent 60%)`;

  const onMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.pointerType !== "mouse") return;
      const rect = ref.current?.getBoundingClientRect();
      if (!rect) return;
      rawX.set(((event.clientX - rect.left) / rect.width - 0.5) * 2);
      rawY.set(((event.clientY - rect.top) / rect.height - 0.5) * 2);
    },
    [rawX, rawY],
  );

  const value = useMemo<StageValue>(() => ({ mx, my, active: depth === "full" }), [mx, my, depth]);

  if (depth === "off") {
    return (
      <div data-depth-stage="off" className={cn("relative", className)}>
        {children}
      </div>
    );
  }

  if (depth === "lite") {
    // Static depth: layering and shadows survive, pointer maths does not.
    return (
      <StageContext.Provider value={{ mx, my, active: false }}>
        <div data-depth-stage="lite" className={cn("relative", className)}>
          {children}
        </div>
      </StageContext.Provider>
    );
  }

  return (
    <StageContext.Provider value={value}>
      <div
        ref={ref}
        data-depth-stage="full"
        className={cn("relative [transform-style:preserve-3d]", className)}
        style={{ perspective } as CSSProperties}
        onPointerMove={onMove}
        onPointerLeave={() => {
          rawX.set(0);
          rawY.set(0);
        }}
      >
        <motion.div
          className="relative h-full w-full rounded-[inherit] [transform-style:preserve-3d] will-change-transform"
          style={{ rotateX, rotateY, ...(dynamicShadow ? { boxShadow } : {}) }}
        >
          {children}
          {edgeLight && (
            <span
              aria-hidden
              className="pointer-events-none absolute inset-x-6 top-0 h-px rounded-full bg-gradient-to-r from-transparent via-primary/45 to-transparent"
            />
          )}
          {sheen && (
            <motion.span
              aria-hidden
              className="pointer-events-none absolute inset-0 rounded-[inherit]"
              style={{ background: sheenBg }}
            />
          )}
        </motion.div>
      </div>
    </StageContext.Provider>
  );
}

/* -------------------------------- DepthLayer ------------------------------- */

type LayerProps = {
  children: ReactNode;
  className?: string;
  /** Extra static styles (sizing etc.) merged with the depth transform. */
  style?: CSSProperties;
  /** How far forward the layer sits, in px of translateZ. */
  z?: number;
  /** Pointer parallax travel in px. Defaults to a fraction of `z`. */
  parallax?: number;
};

/**
 * A single plane inside a `DepthStage`. Pushed forward on the Z axis and
 * drifting slightly faster than the layers behind it.
 */
export function DepthLayer({ children, className, z = 24, parallax, style }: LayerProps) {
  const stage = useContext(StageContext);
  const travel = parallax ?? z * 0.55;
  const fallbackX = useMotionValue(0);
  const fallbackY = useMotionValue(0);
  const x = useTransform(stage?.mx ?? fallbackX, [-1, 1], [-travel, travel]);
  const y = useTransform(stage?.my ?? fallbackY, [-1, 1], [-travel * 0.6, travel * 0.6]);

  if (!stage?.active) {
    return (
      <div className={className} style={style}>
        {children}
      </div>
    );
  }

  return (
    <motion.div
      className={cn("will-change-transform [transform-style:preserve-3d]", className)}
      style={{ ...style, x, y, z }}
    >
      {children}
    </motion.div>
  );
}

/* -------------------------------- FloatPanel ------------------------------- */

/** Slow idle drift, as if the panel is suspended in space. */
export function FloatPanel({
  children,
  className,
  distance = 8,
  duration = 7.5,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  distance?: number;
  duration?: number;
  delay?: number;
}) {
  const depth = useDepthCapability();
  if (depth !== "full") return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={cn("will-change-transform", className)}
      animate={{ y: [0, -distance, 0] }}
      transition={{ duration, delay, repeat: Infinity, ease: "easeInOut" }}
    >
      {children}
    </motion.div>
  );
}

/* -------------------------------- ScrollDepth ------------------------------ */

/**
 * Scroll-linked recession: the section tips back and settles away as the next
 * one takes over, instead of simply scrolling out of frame.
 */
export function ScrollDepth({
  children,
  className,
  rotate = 5,
  scale = 0.94,
  fade = 0.35,
}: {
  children: ReactNode;
  className?: string;
  rotate?: number;
  scale?: number;
  fade?: number;
}) {
  const depth = useDepthCapability();
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const rotateX = useTransform(scrollYProgress, [0, 1], [0, rotate]);
  const s = useTransform(scrollYProgress, [0, 1], [1, scale]);
  const opacity = useTransform(scrollYProgress, [0, 0.85], [1, fade]);

  if (depth !== "full") {
    return (
      <div ref={ref} className={className}>
        {children}
      </div>
    );
  }

  return (
    <div ref={ref} className={cn("[perspective:1400px]", className)}>
      <motion.div
        className="origin-top will-change-transform [transform-style:preserve-3d]"
        style={{ rotateX, scale: s, opacity }}
      >
        {children}
      </motion.div>
    </div>
  );
}

export { zero as depthNoop };
