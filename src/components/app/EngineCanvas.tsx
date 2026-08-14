import type { ReactNode } from "react";
import { Atmosphere } from "@/components/motion/Atmosphere";
import { cn } from "@/lib/utils";

/**
 * Shared canvas for the four Gradr engines.
 *
 * Gives every engine the same spatial frame the landing page uses — an
 * Ocean Teal atmosphere behind the content, one measure, one rhythm — so the
 * curated effects layer reads as one product rather than a marketing site
 * bolted onto an app. Decorative only; it never captures pointer events.
 */
export function EngineCanvas({
  children,
  className,
  atmosphere = true,
}: {
  children: ReactNode;
  className?: string;
  atmosphere?: boolean;
}) {
  return (
    <div className="relative isolate">
      {atmosphere && <Atmosphere beam={false} grain={false} className="opacity-70" />}
      <div className={cn("relative mx-auto w-full max-w-6xl min-w-0 space-y-6", className)}>{children}</div>
    </div>
  );
}

export default EngineCanvas;
