import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Yacht Club badge system.
 *
 * Teal = state and structure (default, `soft`). Mahogany = emphasis, used
 * sparingly for the one thing that deserves attention on a surface
 * (`accent`, `accentSoft`). See /admin/design-system/color-usage.
 */
const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        /** Teal — default status/count badge. */
        default: "border-transparent bg-primary text-primary-foreground hover:bg-primary/80",
        /** Teal tint — quiet metadata inside dense lists and tables. */
        soft: "border-primary/20 bg-primary-soft text-primary hover:bg-primary-soft/80",
        secondary: "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive: "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80",
        outline: "text-foreground",
        /** Mahogany — max one per surface (Popular, New, Pro). */
        accent:
          "border-transparent bg-mahogany text-mahogany-foreground hover:bg-mahogany-hover",
        /** Mahogany tint — highlight that must not shout. */
        accentSoft:
          "border-mahogany-border/80 bg-mahogany-soft text-mahogany-strong hover:bg-mahogany-soft/80",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
