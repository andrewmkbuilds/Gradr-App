import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export type ElevationLevel = 1 | 2 | 3 | 4;

const LEVEL_CLASS: Record<ElevationLevel, string> = {
  1: "elev-1",
  2: "elev-2",
  3: "elev-3",
  4: "elev-4",
};

const RADIUS: Record<ElevationLevel, string> = {
  1: "rounded-xl",
  2: "rounded-xl",
  3: "rounded-2xl",
  4: "rounded-2xl",
};

export interface SurfaceProps extends HTMLAttributes<HTMLDivElement> {
  /** 1 = page canvas, 2 = resting card, 3 = feature panel, 4 = floating/overlay. */
  level?: ElevationLevel;
  /** Adds the hover lift used by clickable cards and tiles. */
  interactive?: boolean;
  /** Drop the default padding when the child controls its own spacing. */
  flush?: boolean;
}

/**
 * The single source of depth for app surfaces. Every dashboard panel goes
 * through this so elevation stays consistent across light and dark themes.
 */
export const Surface = forwardRef<HTMLDivElement, SurfaceProps>(
  ({ level = 2, interactive = false, flush = false, className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        // `depth-surface` gives every app panel its lighting, reflective edge
        // and 3D transform context — the spatial layer is opt-out, not opt-in.
        "depth-surface",
        LEVEL_CLASS[level],
        RADIUS[level],
        !flush && "p-4 sm:p-5",
        interactive && "elev-interactive depth-hover",
        className,
      )}
      {...props}
    />
  ),
);
Surface.displayName = "Surface";

/** Consistent panel header: title on the left, optional action on the right. */
export function SurfaceHeader({
  title,
  icon: Icon,
  action,
  className,
}: {
  title: string;
  icon?: React.ComponentType<{ className?: string }>;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-4 flex items-center justify-between gap-3", className)}>
      <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        {Icon ? <Icon className="h-4 w-4 text-primary" /> : null}
        {title}
      </h3>
      {action}
    </div>
  );
}
