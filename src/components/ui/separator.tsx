import * as React from "react";
import * as SeparatorPrimitive from "@radix-ui/react-separator";

import { cn } from "@/lib/utils";

/**
 * Dividers are structural, so they stay neutral by default. Use `accent`
 * (teal → mahogany fade) only to close a narrative section — never inside
 * forms, tables or lists. See /admin/design-system/color-usage.
 */
type SeparatorVariant = "default" | "accent";

const Separator = React.forwardRef<
  React.ElementRef<typeof SeparatorPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SeparatorPrimitive.Root> & { variant?: SeparatorVariant }
>(({ className, orientation = "horizontal", decorative = true, variant = "default", ...props }, ref) => {
  const isAccent = variant === "accent" && orientation === "horizontal";
  return (
    <SeparatorPrimitive.Root
      ref={ref}
      decorative={decorative}
      orientation={orientation}
      className={cn(
        "shrink-0",
        isAccent ? "accent-rule w-full" : "bg-border",
        !isAccent && (orientation === "horizontal" ? "h-[1px] w-full" : "h-full w-[1px]"),
        className,
      )}
      {...props}
    />
  );
});
Separator.displayName = SeparatorPrimitive.Root.displayName;

export { Separator };
