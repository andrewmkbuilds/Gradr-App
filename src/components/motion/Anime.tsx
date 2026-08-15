import type { ElementType, ReactNode } from "react";
import { useAnime, type AnimeParams, type UseAnimeOptions } from "@/hooks/useAnime";

interface AnimeProps extends UseAnimeOptions {
  /** Properties to animate, e.g. `{ opacity: [0, 1], translateY: [12, 0] }`. */
  animation: AnimeParams;
  as?: ElementType;
  className?: string;
  children?: ReactNode;
}

/**
 * Declarative wrapper around `useAnime` for the common "animate this box on
 * mount" case. Reduced-motion and client-only handling come from the hook.
 */
export function Anime({ animation, as: Tag = "div", className, children, ...options }: AnimeProps) {
  const ref = useAnime<HTMLElement>(animation, options);
  return (
    <Tag ref={ref} className={className}>
      {children}
    </Tag>
  );
}
