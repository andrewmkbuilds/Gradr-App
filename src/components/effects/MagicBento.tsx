import { type ComponentType, type ReactNode } from "react";
import { motion } from "motion/react";
import { SpotlightCard } from "./SpotlightCard";
import { useReducedMotionPref } from "@/hooks/useMotionPreference";
import { easeOut, viewportOnce } from "@/lib/motion/tokens";
import { cn } from "@/lib/utils";

export interface BentoItem {
  key: string;
  title: string;
  copy: string;
  icon?: ComponentType<{ className?: string }>;
  /** Optional index/step marker rendered in the corner. */
  marker?: string;
  /** Column span on large screens. */
  span?: 1 | 2;
  children?: ReactNode;
}

export interface MagicBentoProps {
  items: BentoItem[];
  className?: string;
  columns?: 2 | 3 | 4;
}

const COLS: Record<number, string> = {
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-2 lg:grid-cols-3",
  4: "sm:grid-cols-2 lg:grid-cols-4",
};

/**
 * Bento grid of spotlight surfaces. Replaces flat card grids: each tile
 * lights under the cursor, lifts on hover and enters on a shared stagger.
 */
export function MagicBento({ items, className, columns = 3 }: MagicBentoProps) {
  const reduced = useReducedMotionPref();

  return (
    <ul className={cn("grid gap-4", COLS[columns], className)}>
      {items.map((item, i) => (
        <motion.li
          key={item.key}
          className={cn(item.span === 2 && "lg:col-span-2")}
          initial={reduced ? { opacity: 0 } : { opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={viewportOnce}
          transition={{ duration: 0.55, ease: easeOut, delay: reduced ? 0 : i * 0.06 }}
        >
          <SpotlightCard className="h-full p-6">
            <div className="flex items-start justify-between gap-3">
              {item.icon ? <item.icon className="h-5 w-5 text-primary" /> : null}
              {item.marker ? (
                <span className="text-xs font-semibold tabular-nums tracking-widest text-primary/80">{item.marker}</span>
              ) : null}
            </div>
            <h3 className="mt-4 text-sm font-semibold text-foreground">{item.title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{item.copy}</p>
            {item.children}
          </SpotlightCard>
        </motion.li>
      ))}
    </ul>
  );
}

export default MagicBento;
