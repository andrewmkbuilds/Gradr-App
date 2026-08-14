import { useCallback, useRef, type ComponentProps, type ReactNode } from "react";
import { motion, useMotionTemplate, useMotionValue, useSpring, useTransform } from "motion/react";
import { ChevronDown } from "lucide-react";
import { springPointer, springSnappy } from "@/lib/motion/tokens";
import { useDepthCapability } from "@/hooks/useDepthCapability";
import { scrollIntoViewSafely } from "@/lib/motion/scroll";
import { cn } from "@/lib/utils";

/* -------------------------------- SpatialCard ------------------------------ */

type SpatialCardProps = {
  children: ReactNode;
  className?: string;
  /** Max tilt in degrees. Keep small for content-heavy cards. */
  tilt?: number;
  /** Lift in px on hover. */
  lift?: number;
  /** Pointer-tracked highlight across the surface. */
  glow?: boolean;
  /** Emphasise the card (featured pricing tier, primary CTA panel). */
  featured?: boolean;
} & Omit<ComponentProps<typeof motion.div>, "children" | "className" | "style">;

/**
 * A single interactive surface with tasteful spatial lighting: it tilts a few
 * degrees toward the pointer, lifts on hover, and carries a highlight that
 * tracks the cursor. Degrades to a plain lift at `lite`, and to nothing at
 * `off` — so reduced motion and low-power devices get a flat, calm card.
 */
export function SpatialCard({
  children,
  className,
  tilt = 5,
  lift = 6,
  glow = true,
  featured = false,
  ...rest
}: SpatialCardProps) {
  const depth = useDepthCapability();
  const ref = useRef<HTMLDivElement>(null);
  const rawX = useMotionValue(0);
  const rawY = useMotionValue(0);
  const mx = useSpring(rawX, springPointer);
  const my = useSpring(rawY, springPointer);
  const rotateY = useTransform(mx, [-1, 1], [tilt, -tilt]);
  const rotateX = useTransform(my, [-1, 1], [-tilt, tilt]);
  const gx = useTransform(mx, [-1, 1], [15, 85]);
  const gy = useTransform(my, [-1, 1], [10, 90]);
  const glowBg = useMotionTemplate`radial-gradient(420px circle at ${gx}% ${gy}%, hsl(var(--${
    featured ? "brand-secondary" : "primary"
  }) / 0.14), transparent 62%)`;

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

  if (depth === "off") {
    return (
      <div data-spatial="card" data-depth-level="off" className={cn("relative", className)}>
        {children}
      </div>
    );
  }

  if (depth === "lite") {
    return (
      <motion.div
        data-spatial="card"
        data-depth-level="lite"
        className={cn("relative", className)}
        whileHover={{ y: -lift * 0.5 }}
        transition={springSnappy}
        {...rest}
      >
        {children}
      </motion.div>
    );
  }

  return (
    <div
      ref={ref}
      data-spatial="card"
      data-depth-level="full"
      className={cn("relative [perspective:1100px]", className)}
      onPointerMove={onMove}
      onPointerLeave={() => {
        rawX.set(0);
        rawY.set(0);
      }}
    >
      <motion.div
        className="relative h-full rounded-[inherit] [transform-style:preserve-3d] will-change-transform"
        style={{ rotateX, rotateY }}
        whileHover={{ y: -lift }}
        transition={springSnappy}
        {...rest}
      >
        {children}
        {glow && (
          <motion.span
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-0 transition-opacity duration-300 [.group\\/spatial:hover_&]:opacity-100 hover:opacity-100"
            style={{ background: glowBg }}
          />
        )}
      </motion.div>
    </div>
  );
}

/* -------------------------------- SpatialCta ------------------------------- */

/**
 * Wrapper that gives an important button a small amount of spatial presence:
 * a lit rim, a press-in on tap and a hover lift with a cast shadow.
 */
export function SpatialCta({
  children,
  className,
  intensity = 1,
}: {
  children: ReactNode;
  className?: string;
  intensity?: number;
}) {
  const depth = useDepthCapability();
  if (depth === "off") return <div className={cn("inline-flex", className)}>{children}</div>;

  return (
    <motion.div
      data-spatial="cta"
      className={cn("relative inline-flex rounded-xl [transform-style:preserve-3d]", className)}
      whileHover={{ y: -3 * intensity, scale: 1 + 0.015 * intensity }}
      whileTap={{ y: 0, scale: 0.98 }}
      transition={springSnappy}
      style={{ filter: `drop-shadow(0 ${10 * intensity}px ${18 * intensity}px hsl(var(--primary) / 0.25))` }}
    >
      {children}
    </motion.div>
  );
}

/* --------------------------------- ScrollCue ------------------------------- */

/** Smooth, motion-aware "continue" affordance that walks to the next section. */
export function ScrollCue({
  targetId,
  label = "See how it works",
  className,
}: {
  targetId: string;
  label?: string;
  className?: string;
}) {
  const depth = useDepthCapability();
  return (
    <button
      type="button"
      onClick={() => scrollIntoViewSafely(targetId, { block: "start" })}
      data-spatial="scroll-cue"
      className={cn(
        "group inline-flex min-h-11 items-center gap-2 rounded-full border border-border/70 bg-surface/60 px-4 text-xs uppercase tracking-[0.18em] text-muted-foreground backdrop-blur transition-colors hover:border-primary/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      {label}
      <motion.span
        aria-hidden
        animate={depth === "off" ? undefined : { y: [0, 4, 0] }}
        transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
        className="text-primary"
      >
        <ChevronDown className="h-4 w-4" />
      </motion.span>
    </button>
  );
}
