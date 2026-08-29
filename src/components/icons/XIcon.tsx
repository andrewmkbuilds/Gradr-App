/**
 * X (formerly Twitter) mark — the canonical brand glyph, drawn as inline SVG so
 * it inherits `currentColor` and stays crisp at any size. lucide-react only
 * ships the deprecated bird mark, so this is the only way to show the
 * recognisable X logo.
 */
export function XIcon({
  className,
  size = 16,
  ...props
}: React.SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg
      role="img"
      aria-label="X"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
      className={className}
      {...props}
    >
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.66l-5.214-6.817-5.966 6.817H1.68l7.73-8.835L1.254 2.25h6.83l4.713 6.231 5.447-6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117l11.966 15.644Z" />
    </svg>
  );
}
