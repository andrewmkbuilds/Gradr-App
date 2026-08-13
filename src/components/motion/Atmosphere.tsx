import { useReducedMotionPref } from "@/hooks/useMotionPreference";
import { motion } from "motion/react";

/**
 * Ambient backdrop for marketing surfaces: engineering grid, two slow drifting
 * light fields, a horizon beam and film grain. Purely decorative and
 * pointer-transparent; all motion is transform/opacity only.
 */
export function Atmosphere({
  className = "",
  beam = true,
  grain = true,
}: {
  className?: string;
  beam?: boolean;
  grain?: boolean;
}) {
  const reduced = useReducedMotionPref();

  return (
    <div className={`pointer-events-none absolute inset-0 -z-10 overflow-hidden ${className}`} aria-hidden>
      <div className="absolute inset-0 grid-lines opacity-[0.35]" />

      <motion.div
        className="absolute -left-24 top-[-14rem] h-[34rem] w-[34rem] rounded-full bg-primary/15 blur-[130px]"
        animate={reduced ? undefined : { x: [0, 60, 0], y: [0, 30, 0], opacity: [0.75, 1, 0.75] }}
        transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute -right-24 top-[6rem] h-[28rem] w-[28rem] rounded-full bg-brand-secondary/12 blur-[140px]"
        animate={reduced ? undefined : { x: [0, -50, 0], y: [0, 44, 0], opacity: [0.6, 0.95, 0.6] }}
        transition={{ duration: 26, repeat: Infinity, ease: "easeInOut" }}
      />

      {beam && (
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
      )}

      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-background" />

      {grain && <div className="absolute inset-0 noise-layer" />}
    </div>
  );
}

export default Atmosphere;
