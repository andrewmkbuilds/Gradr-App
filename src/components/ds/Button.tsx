import { forwardRef, type ButtonHTMLAttributes } from "react";
import { Slot } from "@radix-ui/react-slot";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Button as DsButton,
  buttonVariants,
  type ButtonProps as DsButtonProps,
} from "@/design-system/gradr-9b9b95/gradr/components/button";

/**
 * Legacy variant / size names accepted for a safe bulk migration off
 * `@/components/ui/button`. Each maps onto a real design-system variant —
 * no new style values are introduced.
 */
type LegacyVariant = "default" | "secondary" | "success";
type LegacySize = "default";

const VARIANT_ALIASES: Record<LegacyVariant, NonNullable<DsButtonProps["variant"]>> = {
  default: "primary",
  // The design system has no filled neutral button; `outline` is its
  // low-emphasis surface-safe equivalent.
  secondary: "outline",
  // No success button variant exists in the library; a positive confirmation
  // is still a primary action.
  success: "primary",
};

const SIZE_ALIASES: Record<LegacySize, NonNullable<DsButtonProps["size"]>> = {
  default: "md",
};

export interface ButtonProps
  extends Omit<DsButtonProps, "variant" | "size"> {
  variant?: DsButtonProps["variant"] | LegacyVariant;
  size?: DsButtonProps["size"] | LegacySize;
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

function resolve(variant: ButtonProps["variant"], size: ButtonProps["size"]) {
  return {
    variant: (variant && variant in VARIANT_ALIASES
      ? VARIANT_ALIASES[variant as LegacyVariant]
      : variant) as DsButtonProps["variant"],
    size: (size && size in SIZE_ALIASES
      ? SIZE_ALIASES[size as LegacySize]
      : size) as DsButtonProps["size"],
  };
}

/**
 * Design-system Button plus `asChild`, legacy variant/size aliases and a
 * spinner-based `loading` state matching the legacy button's behaviour.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ asChild, className, variant, size, loading, disabled, children, ...props }, ref) => {
    const resolved = resolve(variant, size);

    if (asChild) {
      return (
        <Slot
          ref={ref as never}
          className={cn(buttonVariants(resolved), className)}
          aria-busy={loading || undefined}
          {...(props as ButtonHTMLAttributes<HTMLButtonElement>)}
        >
          {children}
        </Slot>
      );
    }

    return (
      <DsButton
        ref={ref}
        className={className}
        variant={resolved.variant}
        size={resolved.size}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            {children}
          </>
        ) : (
          children
        )}
      </DsButton>
    );
  },
);
Button.displayName = "DsButtonCompat";
