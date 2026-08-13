import { motion } from "motion/react";
import { type ReactNode } from "react";
import { useMotionVariants } from "@/hooks/useMotionVariants";
import { pageTransition } from "@/lib/motion/tokens";

/**
 * Route-level transition. Timing and easing come from the shared motion
 * tokens, and the whole thing collapses to a short cross-fade whenever the
 * user has reduced motion enabled.
 */
export function AnimatedPage({ children }: { children: ReactNode }) {
  const variants = useMotionVariants(pageTransition);

  return (
    <motion.div variants={variants} initial="initial" animate="animate" exit="exit" className="h-full">
      {children}
    </motion.div>
  );
}
