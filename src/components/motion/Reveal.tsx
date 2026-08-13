import { motion, useReducedMotion, type Variants } from "motion/react";
import { type ElementType, type ReactNode } from "react";
import { duration, easeOut, viewportOnce } from "@/lib/motion/tokens";

type Direction = "up" | "down" | "left" | "right" | "none";

const offset: Record<Direction, { x?: number; y?: number }> = {
  up: { y: 22 },
  down: { y: -22 },
  left: { x: 24 },
  right: { x: -24 },
  none: {},
};

export type RevealProps = {
  children: ReactNode;
  className?: string;
  /** Delay in milliseconds (kept in ms for drop-in compatibility). */
  delay?: number;
  direction?: Direction;
  as?: ElementType;
  /** Small scale lift for card-like content. */
  lift?: boolean;
};

/**
 * Scroll-triggered entrance. GPU-only (transform + opacity), fires once, and
 * collapses to a plain fade when the user prefers reduced motion.
 */
export function Reveal({
  children,
  className = "",
  delay = 0,
  direction = "up",
  as = "div",
  lift = false,
}: RevealProps) {
  const reduced = useReducedMotion();
  const Tag = motion.create(as as ElementType);

  const variants: Variants = reduced
    ? { hidden: { opacity: 0 }, show: { opacity: 1, transition: { duration: 0.2 } } }
    : {
        hidden: { opacity: 0, ...offset[direction], scale: lift ? 0.98 : 1 },
        show: {
          opacity: 1,
          x: 0,
          y: 0,
          scale: 1,
          transition: { duration: duration.slow, ease: easeOut, delay: delay / 1000 },
        },
      };

  return (
    <Tag
      className={className}
      variants={variants}
      initial="hidden"
      whileInView="show"
      viewport={viewportOnce}
    >
      {children}
    </Tag>
  );
}

export default Reveal;
