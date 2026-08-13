import { motion, useMotionTemplate, useMotionValue, useSpring, useTransform } from "motion/react";
import { useRef, type ReactNode } from "react";
import { springPointer } from "@/lib/motion/tokens";
import { useDepthCapability } from "@/hooks/useDepthCapability";

type Props = {
  children: ReactNode;
  className?: string;
  /** Max rotation in degrees. */
  tilt?: number;
  /** Render the cursor-following sheen. */
  sheen?: boolean;
  /** Shadow that shifts with the tilt. */
  dynamicShadow?: boolean;
  /** Lift the content off the card surface on the Z axis. */
  lift?: boolean;
};

/**
 * Card that responds to the pointer with a restrained 3D tilt, a light sheen
 * tracking the cursor, a shadow that follows the tilt and content that sits
 * slightly proud of the surface.
 *
 * Mouse-only. Falls back to a static surface on touch, low-power devices and
 * whenever motion is reduced.
 */
export function TiltCard({
  children,
  className = "",
  tilt = 6,
  sheen = true,
  dynamicShadow = true,
  lift = true,
}: Props) {
  const depth = useDepthCapability();
  const ref = useRef<HTMLDivElement>(null);
  const rx = useSpring(useMotionValue(0), springPointer);
  const ry = useSpring(useMotionValue(0), springPointer);
  const px = useMotionValue(50);
  const py = useMotionValue(50);
  const sheenBg = useMotionTemplate`radial-gradient(420px circle at ${px}% ${py}%, hsl(var(--primary) / 0.16), transparent 62%)`;
  const shadowX = useTransform(ry, [-tilt, tilt], [22, -22]);
  const shadowY = useTransform(rx, [-tilt, tilt], [26, -6]);
  const boxShadow = useMotionTemplate`${shadowX}px ${shadowY}px 54px -30px hsl(var(--foreground) / 0.45)`;

  if (depth !== "full") return <div className={`depth-surface ${className}`}>{children}</div>;

  return (
    <motion.div
      ref={ref}
      className={`depth-surface relative [transform-style:preserve-3d] ${className}`}
      style={{
        rotateX: rx,
        rotateY: ry,
        transformPerspective: 1100,
        ...(dynamicShadow ? { boxShadow } : {}),
      }}
      onPointerMove={(e) => {
        if (e.pointerType !== "mouse") return;
        const rect = ref.current?.getBoundingClientRect();
        if (!rect) return;
        const nx = (e.clientX - rect.left) / rect.width;
        const ny = (e.clientY - rect.top) / rect.height;
        px.set(nx * 100);
        py.set(ny * 100);
        ry.set((nx - 0.5) * tilt * 2);
        rx.set((0.5 - ny) * tilt * 2);
      }}
      onPointerLeave={() => {
        rx.set(0);
        ry.set(0);
      }}
    >
      <div className={lift ? "depth-content-sm" : undefined}>{children}</div>
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-5 top-0 h-px rounded-full bg-gradient-to-r from-transparent via-primary/40 to-transparent"
      />
      {sheen && (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-0 transition-opacity duration-300 [.group:hover_&]:opacity-100"
          style={{ background: sheenBg }}
        />
      )}
    </motion.div>
  );
}

export default TiltCard;
