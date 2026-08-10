import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { resolveLogo } from "@/lib/logos";

interface CompanyLogoProps {
  company?: string | null;
  /** Explicit domain overrides name-based inference. */
  domain?: string | null;
  size?: number;
  className?: string;
  rounded?: "md" | "lg" | "full";
}

function initials(name?: string | null) {
  if (!name) return "?";
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
}

/**
 * Company logo with cached Logo.dev lookups, initials fallback and one
 * automatic retry when the image fails to decode.
 */
export function CompanyLogo({
  company,
  domain,
  size = 40,
  className,
  rounded = "lg",
}: CompanyLogoProps) {
  const query = domain || company;
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const retried = useRef(false);

  const px = useMemo(() => Math.min(256, Math.max(64, size * 2)), [size]);

  useEffect(() => {
    let active = true;
    retried.current = false;
    setFailed(false);
    setSrc(null);
    void resolveLogo(query, px).then((entry) => {
      if (active) setSrc(entry.url);
    });
    return () => {
      active = false;
    };
  }, [query, px]);

  const radius =
    rounded === "full" ? "rounded-full" : rounded === "md" ? "rounded-md" : "rounded-lg";

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden border border-border/60 bg-secondary/60 text-[0.7rem] font-semibold text-muted-foreground",
        radius,
        className,
      )}
      style={{ width: size, height: size }}
      aria-hidden={!company}
    >
      {src && !failed ? (
        <img
          src={src}
          alt={company ? `${company} logo` : "Company logo"}
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-contain"
          onError={(e) => {
            // one silent retry (transient network / cold CDN edge)
            if (!retried.current) {
              retried.current = true;
              const img = e.currentTarget;
              const url = src;
              setTimeout(() => {
                img.src = `${url}${url.includes("?") ? "&" : "?"}r=1`;
              }, 600);
              return;
            }
            setFailed(true);
          }}
        />
      ) : (
        <span>{initials(company)}</span>
      )}
    </span>
  );
}

export default CompanyLogo;
