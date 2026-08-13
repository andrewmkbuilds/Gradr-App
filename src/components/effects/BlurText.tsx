import { motion } from "motion/react";
import { type ElementType, type ReactNode } from "react";
import { useReducedMotionPref } from "@/hooks/useMotionPreference";
import { easeOut, viewportOnce } from "@/lib/motion/tokens";

export interface BlurTextProps {
  children: ReactNode;
  as?: ElementType;
  className?: string;
  delay?: number;
  immediate?: boolean;
}

/**
 * Soft focus-in for secondary copy: section ledes, hero subheads, captions.
 * Deliberately quieter than a heading reveal so the hierarchy stays intact.
 */
export function BlurText({ children, as = "p", className, delay = 0, immediate = false }: BlurTextProps) {
  const reduced = useReducedMotionPref();
  const Tag = as as ElementType;

  if (reduced) return <Tag className={className}>{children}</Tag>;

  const MotionTag = motion.create(Tag);
  return (
    <MotionTag
      className={className}
      initial={{ opacity: 0, y: 12, filter: "blur(8px)" }}
      {...(immediate
        ? { animate: { opacity: 1, y: 0, filter: "blur(0px)" } }
        : { whileInView: { opacity: 1, y: 0, filter: "blur(0px)" }, viewport: viewportOnce })}
      transition={{ duration: 0.75, ease: easeOut, delay }}
    >
      {children}
    </MotionTag>
  );
}

export default BlurText;
