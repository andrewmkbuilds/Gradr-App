import { motion } from "framer-motion";
import { type ReactNode } from "react";
import { useReducedMotionPref } from "@/hooks/useMotionPreference";

/** Fast, premium page transition — fade + slight lift + micro-scale. */
const pageVariants = {
  initial: { opacity: 0, y: 10, scale: 0.995 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -6, scale: 0.997 },
};

/** Reduced-motion fallback: a short cross-fade, no movement or scaling. */
const reducedVariants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};

export function AnimatedPage({ children }: { children: ReactNode }) {
  const reduced = useReducedMotionPref();

  return (
    <motion.div
      variants={reduced ? reducedVariants : pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={reduced ? { duration: 0.12 } : { duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      className="h-full"
    >
      {children}
    </motion.div>
  );
}
