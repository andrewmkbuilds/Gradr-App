import { motion, useScroll, useSpring } from "motion/react";

/** Thin reading-progress rail pinned under the top edge of the viewport. */
export function ScrollProgress({ className = "" }: { className?: string }) {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 180, damping: 30, mass: 0.4 });

  return (
    <motion.div
      aria-hidden
      className={`fixed inset-x-0 top-0 z-[60] h-px origin-left bg-gradient-to-r from-primary via-primary-glow to-brand-secondary ${className}`}
      style={{ scaleX }}
    />
  );
}

export default ScrollProgress;
