import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Yacht Club button system. Ocean Teal carries every primary action;
 * Mahogany (`accent`) is reserved for a single strategic call per surface.
 * Focus, active and disabled states are defined once here so no page needs
 * to invent its own.
 */
const buttonVariants = cva(
  "interactive press-scale relative inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium tracking-[-0.005em] ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-45 disabled:shadow-none [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "sheen bg-primary text-primary-foreground shadow-[0_1px_2px_hsl(var(--primary)/0.3)] hover:bg-primary-hover hover:shadow-[0_10px_26px_-14px_hsl(var(--primary)/0.8)] active:translate-y-px",
        accent:
          "bg-brand-secondary text-brand-secondary-foreground hover:bg-brand-secondary-hover hover:shadow-[0_10px_26px_-14px_hsl(var(--brand-secondary)/0.8)] active:translate-y-px",
        success:
          "bg-success text-success-foreground hover:bg-success/90 hover:shadow-[0_10px_26px_-14px_hsl(var(--success)/0.8)]",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90 hover:shadow-[0_10px_26px_-14px_hsl(var(--destructive)/0.7)]",
        outline:
          "border border-border-strong bg-transparent text-foreground hover:border-primary/45 hover:bg-primary/5 hover:text-foreground",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-accent hover:text-accent-foreground",
        ghost: "text-foreground/80 hover:bg-accent hover:text-accent-foreground",
        link: "nav-underline h-auto p-0 text-primary underline-offset-4",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3 text-[13px]",
        lg: "h-12 rounded-lg px-7 text-[15px]",
        /** 44px square — the minimum comfortable touch target. */
        icon: "h-11 w-11",
        "icon-sm": "h-9 w-9 rounded-md",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);


export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  /** Shows an inline spinner and blocks interaction while an action is in flight. */
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading = false, disabled, children, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";

    // `asChild` forwards a single child, so the spinner is only injected for
    // real <button> elements.
    if (asChild) {
      return (
        <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props}>
          {children}
        </Comp>
      );
    }

    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading && <Loader2 className="animate-spin" aria-hidden="true" />}
        {children}
      </Comp>
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
