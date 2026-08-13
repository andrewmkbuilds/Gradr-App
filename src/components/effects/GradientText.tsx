import { type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useReducedMotionPref } from "@/hooks/useMotionPreference";

export interface GradientTextProps {
  children: ReactNode;
  className?: string;
  /** `flow` pans an Ocean Teal → Mahogany gradient, `shine` sweeps a single highlight. */
  variant?: "flow" | "shine";
}

/**
 * Accent typography for key Gradr / AI terminology. Used sparingly — one
 * phrase per view at most, otherwise it stops reading as emphasis.
 */
export function GradientText({ children, className, variant = "flow" }: GradientTextProps) {
  const reduced = useReducedMotionPref();

  if (variant === "shine") {
    return (
      <span
        className={cn(
          "bg-clip-text text-transparent",
          reduced ? "bg-foreground" : "shiny-text",
          className,
        )}
      >
        {children}
      </span>
    );
  }

  return (
    <span className={cn(reduced ? "text-primary" : "animated-gradient-text", className)}>{children}</span>
  );
}

export default GradientText;
