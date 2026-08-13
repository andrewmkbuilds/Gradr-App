import { motion, useMotionValue, useReducedMotion, useSpring } from "motion/react";
import { useRef, type ReactNode } from "react";
import { springPointer } from "@/lib/motion/tokens";

type Props = {
  children: ReactNode;
  className?: string;
  /** Max pixel travel toward the pointer. */
  strength?: number;
};

/**
 * Magnetic wrapper: the child drifts toward the cursor while hovered and
 * springs home on exit. Disabled for touch and reduced-motion users.
 */
export function Magnetic({ children, className = "", strength = 10 }: Props) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const x = useSpring(useMotionValue(0), springPointer);
  const y = useSpring(useMotionValue(0), springPointer);

  if (reduced) return <span className={className}>{children}</span>;

  return (
    <motion.span
      ref={ref}
      className={`inline-block ${className}`}
      style={{ x, y }}
      onPointerMove={(e) => {
        if (e.pointerType !== "mouse") return;
        const rect = ref.current?.getBoundingClientRect();
        if (!rect) return;
        const dx = (e.clientX - (rect.left + rect.width / 2)) / (rect.width / 2);
        const dy = (e.clientY - (rect.top + rect.height / 2)) / (rect.height / 2);
        x.set(Math.max(-1, Math.min(1, dx)) * strength);
        y.set(Math.max(-1, Math.min(1, dy)) * strength);
      }}
      onPointerLeave={() => {
        x.set(0);
        y.set(0);
      }}
    >
      {children}
    </motion.span>
  );
}

export default Magnetic;
