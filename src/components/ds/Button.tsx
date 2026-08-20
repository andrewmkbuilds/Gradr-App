import { forwardRef, type ButtonHTMLAttributes } from "react";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "@/lib/utils";
import {
  Button as DsButton,
  type ButtonProps as DsButtonProps,
} from "@/design-system/gradr-9b9b95/gradr/components/button";
import { buttonVariants } from "@/design-system/gradr-9b9b95/gradr/components/button";

export interface ButtonProps extends DsButtonProps {
  /**
   * Render the design-system button styling onto the single child element
   * (link, motion element, …) instead of a <button>.
   *
   * The attached design system's Button has no `asChild`, and its source is
   * vendor code we must not edit — so this app-level wrapper composes the
   * library's own `buttonVariants` onto a Radix Slot. No new style values are
   * introduced: the classes come from the design system itself.
   */
  asChild?: boolean;
}

/**
 * Design-system Button plus `asChild`. Import this from app code when a
 * button needs to render as a link or animated element; otherwise import
 * `Button` straight from `@/design-system/gradr-9b9b95`.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ asChild, className, variant, size, loading, disabled, children, ...props }, ref) => {
    if (!asChild) {
      return (
        <DsButton
          ref={ref}
          className={className}
          variant={variant}
          size={size}
          loading={loading}
          disabled={disabled}
          {...props}
        >
          {children}
        </DsButton>
      );
    }

    return (
      <Slot
        ref={ref as never}
        className={cn(buttonVariants({ variant, size }), className)}
        aria-busy={loading || undefined}
        {...(props as ButtonHTMLAttributes<HTMLButtonElement>)}
      >
        {children}
      </Slot>
    );
  },
);
Button.displayName = "DsButtonWithAsChild";
