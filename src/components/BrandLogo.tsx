import { cn } from "@/lib/utils";

/**
 * Official Gradr brand mark.
 *
 * The artwork is fixed and approved — it is never redrawn, recoloured or
 * regenerated. Source-of-truth files live in `public/brand/`; everything below
 * is a pure scale of that artwork produced by `scripts/generate-brand-logo.mjs`.
 *
 * The same transparent colour mark is used on light and dark surfaces; when a
 * surface hurts legibility, the background adapts — never the logo.
 */
/** Primary transparent colour mark (256px build for UI, 512px master). */
export const BRAND_LOGO_URL = "/gradr-logo-256.png";
/** Kept for existing call sites — resolves to the same official mark. */
export const BRAND_LOGO_DARK_URL = "/gradr-logo-256.png";
export const BRAND_LOGO_FULL_URL = "/gradr-logo.png";
/** Official app icon — favicon, PWA, avatars, tiny surfaces. */
export const BRAND_APP_ICON_URL = "/icon-512.png";
/** Single-colour vector mark; inherits `color` via currentColor. */
export const BRAND_LOGO_MONO_URL = "/gradr-logo-mono.svg";
/** Official monochrome artwork, for print/export contexts. */
export const BRAND_LOGO_MONO_BLACK_URL = "/gradr-logo-mono-black.png";
export const BRAND_LOGO_MONO_WHITE_URL = "/gradr-logo-mono-white.png";
/** Symbol + GRADR wordmark, for docs, decks and email headers. */
export const BRAND_LOCKUP_URL = "/gradr-lockup.png";
export const BRAND_LOCKUP_DARK_URL = "/gradr-lockup-dark.png";


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
  return (
    <span
      className={cn("relative inline-grid shrink-0 place-items-center align-middle", className)}
      style={{ width: size, height: size }}
      data-brand-logo=""
    >
      <img
        src={BRAND_LOGO_URL}
        width={size}
        height={size}
        style={{ width: size, height: "auto" }}
        alt={decorative ? "" : "Gradr"}
        aria-hidden={decorative || undefined}
        draggable={false}
        decoding="async"
        loading={priority ? "eager" : "lazy"}
        className="col-start-1 row-start-1 block object-contain"
      />
    </span>
  );
}
