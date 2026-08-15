/**
 * The shared visual language for every canvas-backed surface on the landing
 * page. Its job is to make three very different effects read as one system:
 * the same soft teal bloom underneath, the same reflective glass rim, the same
 * corner registration marks.
 *
 * Purely presentational and `aria-hidden` where decorative — the content it
 * frames is always ordinary DOM.
 */

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface CanvasFxFrameProps {
  children: ReactNode;
  className?: string;
  /** Ambient bloom strength behind the surface. */
  glow?: "none" | "soft" | "strong";
  /** Draw the corner registration marks that tie the surfaces together. */
  marks?: boolean;
  /** Clip children to the surface. Disable when content intentionally overhangs. */
  clip?: boolean;
  /** Short caption describing the interaction, e.g. "Move your cursor". */
  hint?: ReactNode;
}

const GLOW: Record<NonNullable<CanvasFxFrameProps["glow"]>, string> = {
  none: "",
  soft: "before:opacity-60",
  strong: "before:opacity-100",
};

export function CanvasFxFrame({
  children,
  className,
  glow = "soft",
  marks = true,
  clip = true,
  hint,
}: CanvasFxFrameProps) {
  return (
    <div className={cn("relative", className)}>
      {/* Ambient bloom. Sits behind the surface, never over the content. */}
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute -inset-6 -z-10 rounded-[2rem]",
          "before:absolute before:inset-0 before:rounded-[2rem] before:blur-2xl",
          "before:bg-[radial-gradient(60%_60%_at_50%_35%,hsl(var(--primary)/0.22),transparent_70%)]",
          "before:transition-opacity before:duration-700",
          GLOW[glow],
        )}
      />

      <div
        className={cn(
          "relative rounded-2xl border border-border/70",
          // Slots whose children deliberately overhang the surface (the hero
          // command centre floats a card past its edge) opt out of clipping.
          // Canvas mode does its own clipping on the effect shell.
          clip && "overflow-hidden",
          "bg-surface/40 backdrop-blur-[2px]",
          "shadow-[0_30px_80px_-40px_hsl(var(--primary)/0.45)]",
        )}
      >
        {/* Reflective top rim — the shared "glass" cue. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 z-20 h-px bg-gradient-to-r from-transparent via-foreground/25 to-transparent"
        />
        {marks && <RegistrationMarks />}
        {children}
      </div>

      {hint && (
        <p className="mt-3 flex items-center justify-center gap-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  );
}

/** Corner ticks. Small, quiet, and repeated on every canvas surface. */
function RegistrationMarks() {
  const base =
    "pointer-events-none absolute z-20 h-3 w-3 border-primary/40 opacity-70";
  return (
    <div aria-hidden>
      <span className={cn(base, "left-2 top-2 border-l border-t")} />
      <span className={cn(base, "right-2 top-2 border-r border-t")} />
      <span className={cn(base, "bottom-2 left-2 border-b border-l")} />
      <span className={cn(base, "bottom-2 right-2 border-b border-r")} />
    </div>
  );
}
