import logoAsset from "@/assets/gradr-logo.png.asset.json";
import { cn } from "@/lib/utils";

type BrandLogoProps = {
  /** Rendered box size in px. The source is square, so width === height. */
  size?: number;
  className?: string;
  /** Set false when the logo sits next to a visible "Gradr" wordmark. */
  decorative?: boolean;
};

/**
 * The single source of truth for the Gradr app mark.
 * Uses the official logo exactly as supplied — square, never stretched.
 */
export function BrandLogo({ size = 32, className, decorative = true }: BrandLogoProps) {
  return (
    <img
      src={logoAsset.url}
      width={size}
      height={size}
      style={{ width: size, height: size }}
      className={cn("shrink-0 select-none rounded-[22%] object-contain", className)}
      alt={decorative ? "" : "Gradr"}
      aria-hidden={decorative || undefined}
      draggable={false}
      decoding="async"
    />
  );
}

export const BRAND_LOGO_URL = logoAsset.url;
