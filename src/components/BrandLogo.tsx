import { cn } from "@/lib/utils";

/**
 * Official Gradr mark. Lives in public/ so the same files back the favicon,
 * apple-touch-icon and PWA icons.
 *
 * The supplied logo is a dark navy mark, which disappears against the dark
 * theme — so a second asset places the identical mark on the light brand plate.
 * Both are rendered and swapped with CSS (`dark:`) rather than JS, so the right
 * one paints on the very first frame with no flash.
 */
/**
 * UI marks use a 256px variant (~40KB instead of ~170KB) — the full-size
 * files stay reserved for PWA icons and social cards.
 */
export const BRAND_LOGO_URL = "/gradr-logo-256.png";
export const BRAND_LOGO_DARK_URL = "/gradr-logo-dark-256.png";
export const BRAND_LOGO_FULL_URL = "/gradr-logo.png";

type BrandLogoProps = {
  /** Rendered box size in px. The source is square, so width === height. */
  size?: number;
  className?: string;
  /** Set false when the logo sits next to a visible "Gradr" wordmark. */
  decorative?: boolean;
  /** Above-the-fold marks (header, auth hero) should not lazy-load. */
  priority?: boolean;
};

export function BrandLogo({ size = 32, className, decorative = true, priority = true }: BrandLogoProps) {
  const shared = {
    width: size,
    height: size,
    style: { width: size, height: size },
    alt: decorative ? "" : "Gradr",
    "aria-hidden": decorative || undefined,
    draggable: false,
    decoding: "async" as const,
    loading: (priority ? "eager" : "lazy") as "eager" | "lazy",
  };

  return (
    <span
      className={cn("relative inline-flex shrink-0", className)}
      style={{ width: size, height: size }}
      data-brand-logo=""
    >
      <img
        {...shared}
        src={BRAND_LOGO_URL}
        className="block rounded-[22%] object-contain dark:hidden"
      />
      <img
        {...shared}
        src={BRAND_LOGO_DARK_URL}
        alt=""
        aria-hidden
        className="hidden rounded-[22%] object-contain dark:block"
      />
    </span>
  );
}
