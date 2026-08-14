import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { DepthStage, DepthLayer, FloatPanel } from "@/components/motion";
import { cn } from "@/lib/utils";

export interface DepthHighlight {
  icon: LucideIcon;
  label: string;
  /** Corner the chip is pinned to. */
  at: "tl" | "tr" | "bl" | "br";
  /** How far forward the chip floats, in px of translateZ. */
  z?: number;
}

const CORNER: Record<DepthHighlight["at"], string> = {
  tl: "-left-3 -top-4 sm:-left-6",
  tr: "-right-3 -top-4 sm:-right-6",
  bl: "-left-3 -bottom-4 sm:-left-6",
  br: "-right-3 -bottom-4 sm:-right-6",
};

/**
 * An interactive 3D stage for a product module: the surface tilts toward the
 * pointer, the main panel sits mid-depth, and small highlight chips float in
 * front of it at their own parallax rate.
 *
 * The whole composition collapses to a plain panel when the depth manager
 * reports `lite`/`off`, so low-power devices and reduced-motion users get the
 * same content with none of the 3D work.
 */
export function DepthShowcase({
  children,
  highlights = [],
  className,
  tilt = 6,
}: {
  children: ReactNode;
  highlights?: DepthHighlight[];
  className?: string;
  tilt?: number;
}) {
  return (
    <DepthStage tilt={tilt} className={cn("rounded-3xl", className)}>
      <DepthLayer z={18} className="relative rounded-3xl">
        {children}
      </DepthLayer>

      {highlights.map((h, i) => (
        <DepthLayer
          key={h.label}
          z={h.z ?? 70 + i * 12}
          className={cn("pointer-events-none absolute z-10 hidden sm:block", CORNER[h.at])}
        >
          <FloatPanel distance={7} duration={7 + i} delay={i * 0.4}>
            <span className="flex items-center gap-2 rounded-full border border-border/70 bg-surface/80 px-3 py-2 text-[11px] font-medium text-foreground shadow-[0_18px_40px_-24px_hsl(var(--foreground)/0.6)] backdrop-blur">
              <h.icon className="h-3.5 w-3.5 text-primary" aria-hidden />
              {h.label}
            </span>
          </FloatPanel>
        </DepthLayer>
      ))}
    </DepthStage>
  );
}

export default DepthShowcase;
