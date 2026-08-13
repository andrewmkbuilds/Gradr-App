import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Yacht Club card system. Every card is a deliberate information surface:
 * `data` rests, `insight` claims the page, `highlight` marks a brand moment,
 * `warning` asks for attention. Radius and shadow are fixed by the token
 * system so no card can drift into a different design language.
 */
const cardVariants = cva("rounded-xl text-card-foreground transition-[box-shadow,transform,border-color] duration-200", {
  variants: {
    tone: {
      /** Resting neutral surface — the default for most content. */
      default: "elev-2",
      /** Clean data surface: flatter, for tables and dense readouts. */
      data: "elev-1",
      /** The one card on the page that should dominate. Deep ocean teal. */
      insight:
        "border border-primary/25 bg-primary text-primary-foreground shadow-[0_18px_40px_-24px_hsl(var(--primary)/0.7)] [&_.text-muted-foreground]:text-primary-foreground/75",
      /** Brand moment — mahogany hairline and wash. */
      highlight: "border border-brand-secondary/30 bg-brand-secondary-soft/60",
      /** Needs attention, without shouting. */
      warning: "border border-warning/35 bg-warning-soft/60",
      /** Something went wrong. */
      danger: "border border-destructive/35 bg-destructive-soft/50",
    },
    interactive: { true: "elev-interactive cursor-pointer", false: "" },
  },
  defaultVariants: { tone: "default", interactive: false },
});

export interface CardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {}

const Card = React.forwardRef<HTMLDivElement, CardProps>(({ className, tone, interactive, ...props }, ref) => (
  <div ref={ref} className={cn(cardVariants({ tone, interactive }), className)} {...props} />
));
Card.displayName = "Card";


const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex flex-col space-y-1.5 p-6", className)} {...props} />
  ),
);
CardHeader.displayName = "CardHeader";

const CardTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3 ref={ref} className={cn("text-2xl font-semibold leading-none tracking-tight", className)} {...props} />
  ),
);
CardTitle.displayName = "CardTitle";

const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
  ),
);
CardDescription.displayName = "CardDescription";

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />,
);
CardContent.displayName = "CardContent";

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex items-center p-6 pt-0", className)} {...props} />
  ),
);
CardFooter.displayName = "CardFooter";

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent };
