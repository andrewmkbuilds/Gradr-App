import { motion, useScroll, useSpring, useTransform } from "motion/react";
import { useRef, type ReactNode } from "react";
import { useDepthCapability } from "@/hooks/useDepthCapability";
import { cn } from "@/lib/utils";

export interface ScrollFloatProps {
  children: ReactNode;
  className?: string;
  /** Vertical travel across the scroll range, in pixels. */
  distance?: number;
  /** Adds a small scale settle as the element reaches center. */
  scale?: boolean;
}

/**
 * Scroll-linked float: content drifts up and settles as its section crosses
 * the viewport, tying sections together instead of popping in as blocks.
 */
export function ScrollFloat({ children, className, distance = 48, scale = true }: ScrollFloatProps) {
  const ref = useRef<HTMLDivElement>(null);
  const level = useDepthCapability();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "center center"] });
  const eased = useSpring(scrollYProgress, { stiffness: 120, damping: 26, mass: 0.6 });

  const y = useTransform(eased, [0, 1], [distance, 0]);
  const s = useTransform(eased, [0, 1], [scale ? 0.97 : 1, 1]);
  const opacity = useTransform(eased, [0, 0.6], [0.45, 1]);

  if (level === "off") {
    return (
      <div ref={ref} className={className}>
        {children}
      </div>
    );
  }

  return (
    <motion.div ref={ref} className={cn("will-change-transform", className)} style={{ y, scale: s, opacity }}>
      {children}
    </motion.div>
  );
}

export default ScrollFloat;
