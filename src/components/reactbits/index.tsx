/**
 * React Bits components, tuned to the Gradr design language.
 *
 * Only a curated set is vendored (see ./*.tsx). Everything here:
 *  - uses Gradr semantic tokens instead of the upstream demo colors,
 *  - degrades to a static, readable state under `prefers-reduced-motion`,
 *  - is pointer/CSS driven only — no continuous JS loops.
 */
import { useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";
import RotatingTextBase from "./RotatingText";
import BorderGlowBase from "./BorderGlow";
import GlareHoverBase from "./GlareHover";

/* ------------------------------ concept loop ------------------------------ */

/**
 * Cycles Gradr capability names in place. Reserved for one spot per page —
 * the hero capability ticker.
 */
export function ConceptLoop({
  items,
  className = "",
  interval = 2400,
}: {
  items: string[];
  className?: string;
  interval?: number;
}) {
  const reduce = useReducedMotion();
  if (reduce) return <span className={className}>{items[0]}</span>;
  return (
    <RotatingTextBase
      texts={items}
      rotationInterval={interval}
      staggerDuration={0.014}
      staggerFrom="first"
      splitBy="characters"
      mainClassName={`inline-flex overflow-hidden py-0.5 ${className}`}
      splitLevelClassName="overflow-hidden"
      transition={{ type: "spring", damping: 26, stiffness: 320 }}
      initial={{ y: "100%", opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: "-110%", opacity: 0 }}
    />
  );
}

/* ------------------------------- glow frame ------------------------------- */

/**
 * Cursor-tracked edge light. Used only on a page's single most important
 * surface (the featured pricing plan, the final CTA).
 */
export function GlowFrame({
  children,
  className = "",
  radius = 20,
  intensity = 0.85,
}: {
  children: ReactNode;
  className?: string;
  radius?: number;
  intensity?: number;
}) {
  const reduce = useReducedMotion();
  if (reduce) {
    return <div className={`rounded-[20px] border border-primary/30 bg-card ${className}`}>{children}</div>;
  }
  return (
    <BorderGlowBase
      className={className}
      borderRadius={radius}
      glowRadius={28}
      glowIntensity={intensity}
      edgeSensitivity={26}
      fillOpacity={0.18}
      glowColor="var(--primary-hsl-fallback, 190 95% 55%)"
      backgroundColor="hsl(var(--card))"
      colors={["hsl(190 95% 55%)", "hsl(210 90% 62%)", "hsl(266 70% 68%)"]}
    >
      {children}
    </BorderGlowBase>
  );
}

/* --------------------------------- glare --------------------------------- */

/**
 * A single specular sweep across a card on hover. Transparent by default so it
 * composes over existing Gradr glass surfaces instead of replacing them.
 */
export function Glare({
  children,
  className = "",
  radius = "16px",
}: {
  children: ReactNode;
  className?: string;
  radius?: string;
}) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <GlareHoverBase
      className={className}
      width="100%"
      height="100%"
      background="transparent"
      borderColor="transparent"
      borderRadius={radius}
      glareColor="#9be9ff"
      glareOpacity={0.16}
      glareAngle={-38}
      glareSize={220}
      transitionDuration={780}
      style={{ display: "block" }}
    >
      {children}
    </GlareHoverBase>
  );
}
