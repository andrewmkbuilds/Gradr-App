import { motion, useReducedMotion, useScroll, useSpring, useTransform } from "motion/react";
import { useRef, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  className?: string;
  /** Pixels of travel across the full scroll pass. Negative moves up. */
  distance?: number;
};

/** Scroll parallax on a single transform channel — cheap and GPU friendly. */
export function Parallax({ children, className = "", distance = -60 }: Props) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const y = useSpring(useTransform(scrollYProgress, [0, 1], [-distance / 2, distance / 2]), {
    stiffness: 120,
    damping: 30,
    mass: 0.6,
  });

  return (
    <div ref={ref} className={className}>
      <motion.div style={reduced ? undefined : { y }}>{children}</motion.div>
    </div>
  );
}

export default Parallax;
