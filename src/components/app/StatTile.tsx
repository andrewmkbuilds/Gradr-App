import { motion } from "motion/react";
import type { LucideIcon } from "lucide-react";
import { CountUp } from "@/components/motion";
import { Surface } from "@/components/ui/surface";
import { useReducedMotionPref } from "@/hooks/useMotionPreference";
import { duration, easeOut } from "@/lib/motion/tokens";
import { cn } from "@/lib/utils";

export interface StatTileProps {
  label: string;
  value: number;
  suffix?: string;
  icon: LucideIcon;
  /** Ocean Teal by default; mahogany for secondary emphasis. */
  tone?: "primary" | "secondary" | "success";
  hint?: string;
  index?: number;
  className?: string;
}

const TONE: Record<NonNullable<StatTileProps["tone"]>, string> = {
  primary: "bg-primary/10 text-primary",
  secondary: "bg-brand-secondary/10 text-brand-secondary",
  success: "bg-success/10 text-success",
};

/** Compact metric tile with a counted value and a hover lift. */
export function StatTile({
  label,
  value,
  suffix = "",
  icon: Icon,
  tone = "primary",
  hint,
  index = 0,
  className,
}: StatTileProps) {
  const reduced = useReducedMotionPref();

  return (
    <motion.div
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduced ? { duration: 0.14 } : { duration: duration.base, ease: easeOut, delay: index * 0.06 }}
    >
      <Surface level={2} interactive className={cn("space-y-3", className)}>
        <div className="flex items-center gap-2">
          <span className={cn("flex h-8 w-8 items-center justify-center rounded-lg", TONE[tone])}>
            <Icon className="h-4 w-4" aria-hidden="true" />
          </span>
          <span className="text-xs text-muted-foreground">{label}</span>
        </div>
        <p className="font-display text-3xl leading-none tracking-tight text-foreground">
          <CountUp to={value} suffix={suffix} duration={1} />
        </p>
        {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
      </Surface>
    </motion.div>
  );
}

export default StatTile;
