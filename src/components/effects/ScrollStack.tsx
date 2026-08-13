import { motion, useScroll, useTransform } from "motion/react";
import { useRef, type ReactNode } from "react";
import { useDepthCapability } from "@/hooks/useDepthCapability";
import { cn } from "@/lib/utils";

export interface ScrollStackProps {
  children: ReactNode[];
  className?: string;
  /** Pixel offset between stacked cards at rest. */
  offset?: number;
}

function StackItem({
  children,
  index,
  total,
  offset,
}: {
  children: ReactNode;
  index: number;
  total: number;
  offset: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start center", "end start"] });
  // Cards shrink and dim slightly as the next one slides over them.
  const scale = useTransform(scrollYProgress, [0, 1], [1, 0.94]);
  const opacity = useTransform(scrollYProgress, [0, 0.85], [1, 0.55]);

  return (
    <motion.div
      ref={ref}
      className="sticky"
      style={{
        top: `calc(6rem + ${index * offset}px)`,
        zIndex: index + 1,
        scale,
        opacity,
      }}
    >
      {children}
    </motion.div>
  );
}

/**
 * Sticky card stack: as you scroll, each card parks under the header while the
 * next slides over it. Degrades to a plain vertical list when depth is off.
 */
export function ScrollStack({ children, className, offset = 14 }: ScrollStackProps) {
  const level = useDepthCapability();
  const items = children.filter(Boolean);

  if (level !== "full") {
    return <div className={cn("space-y-4", className)}>{items}</div>;
  }

  return (
    <div className={cn("space-y-6", className)}>
      {items.map((child, i) => (
        <StackItem key={i} index={i} total={items.length} offset={offset}>
          {child}
        </StackItem>
      ))}
    </div>
  );
}

export default ScrollStack;
