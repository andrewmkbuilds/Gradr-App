import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { useReducedMotionPref } from "@/hooks/useMotionPreference";
import { easeOut } from "@/lib/motion/tokens";
import { cn } from "@/lib/utils";

export interface TextLoopProps {
  items: string[];
  className?: string;
  /** Milliseconds each item stays on screen. */
  interval?: number;
}

/**
 * Cycles through Gradr's capability vocabulary in place. The widest item is
 * rendered invisibly to reserve width so surrounding copy never reflows.
 */
export function TextLoop({ items, className, interval = 2200 }: TextLoopProps) {
  const reduced = useReducedMotionPref();
  const [i, setI] = useState(0);

  useEffect(() => {
    if (reduced || items.length < 2) return;
    const id = window.setInterval(() => setI((n) => (n + 1) % items.length), interval);
    return () => window.clearInterval(id);
  }, [reduced, items.length, interval]);

  const widest = items.reduce((a, b) => (b.length > a.length ? b : a), "");

  if (reduced) return <span className={className}>{items[0]}</span>;

  return (
    <span className={cn("relative inline-grid overflow-hidden align-bottom", className)}>
      <span className="invisible col-start-1 row-start-1" aria-hidden>
        {widest}
      </span>
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={items[i]}
          className="col-start-1 row-start-1 whitespace-nowrap"
          initial={{ y: "70%", opacity: 0, filter: "blur(5px)" }}
          animate={{ y: "0%", opacity: 1, filter: "blur(0px)" }}
          exit={{ y: "-70%", opacity: 0, filter: "blur(5px)" }}
          transition={{ duration: 0.42, ease: easeOut }}
        >
          {items[i]}
        </motion.span>
      </AnimatePresence>
      <span className="sr-only">{items.join(", ")}</span>
    </span>
  );
}

export default TextLoop;
