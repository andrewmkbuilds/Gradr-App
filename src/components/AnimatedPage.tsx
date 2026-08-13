import { motion } from "framer-motion";
import { type ReactNode } from "react";
import { pageTransition, pageVariants, reducedPageVariants } from "@/lib/motion";
import { useAppReducedMotion } from "@/hooks/useMotionPrefs";

/**
 * Premium page transition — fade + lift + micro-scale + focus blur.
 * Motion values come from the shared motion system (`@/lib/motion`) and
 * collapse to a plain fade when the user prefers reduced motion.
 */
export function AnimatedPage({ children }: { children: ReactNode }) {
  const reduce = useAppReducedMotion();
  return (
    <motion.div
      variants={reduce ? reducedPageVariants : pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={reduce ? { duration: 0.15 } : pageTransition}
      className="h-full"
    >
      {children}
    </motion.div>
  );
}
