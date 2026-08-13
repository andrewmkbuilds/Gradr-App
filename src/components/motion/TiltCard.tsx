import { motion, useMotionTemplate, useMotionValue, useReducedMotion, useSpring } from "motion/react";
import { useRef, type ReactNode } from "react";
import { springPointer } from "@/lib/motion/tokens";

type Props = {
  children: ReactNode;
  className?: string;
  /** Max rotation in degrees. */
  tilt?: number;
  /** Render the cursor-following sheen. */
  sheen?: boolean;
};

/**
 * Card that responds to the pointer with a restrained 3D tilt plus a light
 * sheen tracking the cursor. Mouse only; static for touch/reduced motion.
 */
export function TiltCard({ children, className = "", tilt = 6, sheen = true }: Props) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const rx = useSpring(useMotionValue(0), springPointer);
  const ry = useSpring(useMotionValue(0), springPointer);
  const px = useMotionValue(50);
  const py = useMotionValue(50);
  const sheenBg = useMotionTemplate`radial-gradient(420px circle at ${px}% ${py}%, hsl(var(--primary) / 0.16), transparent 62%)`;

  if (reduced) return <div className={className}>{children}</div>;

  return (
    <motion.div
      ref={ref}
      className={`relative ${className}`}
      style={{ rotateX: rx, rotateY: ry, transformStyle: "preserve-3d", perspective: 1000 }}
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
      {children}
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
