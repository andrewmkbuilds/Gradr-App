/**
 * Gradr ambient background system.
 *
 * Every background is CSS/transform driven (no canvas, no particle loops) so it
 * stays cheap on the main thread, and every animated one is silenced under
 * `prefers-reduced-motion`. Use ONE background per section — they are designed
 * to be layered against `bg-background`, never against each other.
 */
import { motion, useReducedMotion } from "framer-motion";
import type { CSSProperties } from "react";

type BgProps = { className?: string; intensity?: number };

const base = "pointer-events-none absolute inset-0 -z-10 overflow-hidden";

/** Wide, slow aurora wash. Best behind the hero and the final CTA. */
export function Aurora({ className = "", intensity = 1 }: BgProps) {
  const reduce = useReducedMotion();
  const o = (v: number) => v * intensity;
  return (
    <div className={`${base} ${className}`} aria-hidden>
      <motion.div
        className="absolute left-1/2 top-[-22rem] h-[42rem] w-[64rem] -translate-x-1/2 rounded-full blur-[150px]"
        style={{ background: `radial-gradient(closest-side, hsl(var(--primary) / ${o(0.22)}), transparent 70%)` }}
        animate={reduce ? undefined : { opacity: [0.7, 1, 0.7], scale: [1, 1.07, 1] }}
        transition={{ duration: 16, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute right-[-14rem] top-[6rem] h-[34rem] w-[34rem] rounded-full blur-[140px]"
        style={{ background: `radial-gradient(closest-side, hsl(195 52% 34% / ${o(0.16)}), transparent 70%)` }}
        animate={reduce ? undefined : { opacity: [0.55, 0.9, 0.55], y: [0, -24, 0] }}
        transition={{ duration: 20, repeat: Infinity, ease: "easeInOut", delay: 2 }}
      />
      <motion.div
        className="absolute bottom-[-16rem] left-[-10rem] h-[30rem] w-[30rem] rounded-full blur-[150px]"
        style={{ background: `radial-gradient(closest-side, hsl(20 52% 32% / ${o(0.12)}), transparent 70%)` }}
        animate={reduce ? undefined : { opacity: [0.4, 0.7, 0.4], x: [0, 26, 0] }}
        transition={{ duration: 24, repeat: Infinity, ease: "easeInOut", delay: 5 }}
      />
    </div>
  );
}

/** Very quiet aurora, for long reading sections. */
export function SoftAurora({ className = "" }: BgProps) {
  return (
    <div className={`${base} ${className}`} aria-hidden>
      <div
        className="absolute inset-x-0 top-0 h-[26rem]"
        style={{ background: `radial-gradient(60% 100% at 50% 0%, hsl(var(--primary) / 0.07), transparent 70%)` }}
      />
    </div>
  );
}

/** Angled light beams sweeping slowly across the surface. */
export function Beams({ className = "", intensity = 1 }: BgProps) {
  const reduce = useReducedMotion();
  return (
    <div className={`${base} ${className}`} aria-hidden>
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className="absolute -top-1/2 h-[200%] w-[14rem] blur-3xl"
          style={{
            left: `${18 + i * 28}%`,
            rotate: "18deg",
            background: `linear-gradient(to bottom, transparent, hsl(var(--primary) / ${0.1 * intensity}), transparent)`,
          }}
          animate={reduce ? undefined : { x: [-40, 40, -40], opacity: [0.4, 0.8, 0.4] }}
          transition={{ duration: 18 + i * 4, repeat: Infinity, ease: "easeInOut", delay: i * 2 }}
        />
      ))}
    </div>
  );
}

/** Static dot field with a soft radial mask. Cheap, works everywhere. */
export function DotGrid({ className = "", intensity = 1 }: BgProps) {
  const style: CSSProperties = {
    backgroundImage: `radial-gradient(circle at 1px 1px, hsl(var(--foreground) / ${0.09 * intensity}) 1px, transparent 0)`,
    backgroundSize: "28px 28px",
    maskImage: "radial-gradient(75% 60% at 50% 35%, #000 40%, transparent 100%)",
    WebkitMaskImage: "radial-gradient(75% 60% at 50% 35%, #000 40%, transparent 100%)",
  };
  return (
    <div className={`${base} ${className}`} aria-hidden>
      <div className="absolute inset-0" style={style} />
    </div>
  );
}

/** Perspective grid with a scanning highlight line. */
export function GridScan({ className = "", intensity = 1 }: BgProps) {
  const reduce = useReducedMotion();
  return (
    <div className={`${base} ${className}`} aria-hidden>
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `linear-gradient(hsl(var(--foreground) / ${0.05 * intensity}) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground) / ${0.05 * intensity}) 1px, transparent 1px)`,
          backgroundSize: "64px 64px",
          maskImage: "linear-gradient(to bottom, transparent, #000 25%, #000 70%, transparent)",
          WebkitMaskImage: "linear-gradient(to bottom, transparent, #000 25%, #000 70%, transparent)",
        }}
      />
      {!reduce && (
        <motion.div
          className="absolute inset-x-0 h-40"
          style={{ background: `linear-gradient(to bottom, transparent, hsl(var(--primary) / 0.10), transparent)` }}
          animate={{ y: ["-10%", "110%"] }}
          transition={{ duration: 11, repeat: Infinity, ease: "linear" }}
        />
      )}
    </div>
  );
}

/** Thin horizontal lines drifting like fibre-optic threads. */
export function Threads({ className = "" }: BgProps) {
  const reduce = useReducedMotion();
  return (
    <div className={`${base} ${className}`} aria-hidden>
      {[12, 32, 55, 74, 88].map((top, i) => (
        <motion.div
          key={top}
          className="absolute h-px w-[42%]"
          style={{
            top: `${top}%`,
            background: `linear-gradient(to right, transparent, hsl(var(--primary) / 0.4), transparent)`,
          }}
          initial={{ x: "-45%" }}
          animate={reduce ? undefined : { x: ["-45%", "145%"] }}
          transition={{ duration: 14 + i * 3, repeat: Infinity, ease: "linear", delay: i * 2.5 }}
        />
      ))}
    </div>
  );
}

/** Fine film grain. Sits above content colour but below interaction. */
export function Noise({ className = "", intensity = 1 }: BgProps) {
  return (
    <div
      className={`pointer-events-none absolute inset-0 -z-10 ${className}`}
      aria-hidden
      style={{
        opacity: 0.5 * intensity,
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.045'/%3E%3C/svg%3E\")",
      }}
    />
  );
}

/** Grainy gradient wash — gradient + noise in one layer. */
export function Grainient({ className = "", intensity = 1 }: BgProps) {
  return (
    <div className={`${base} ${className}`} aria-hidden>
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(90% 70% at 50% 100%, hsl(var(--primary) / ${0.12 * intensity}), transparent 70%)`,
        }}
      />
      <Noise intensity={0.8} />
    </div>
  );
}

/** Hairline divider that glows toward the centre — used between story chapters. */
export function ChapterRule({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`h-px w-full ${className}`}
      style={{
        background: `linear-gradient(to right, transparent, hsl(var(--border)), hsl(var(--primary) / 0.45), hsl(var(--border)), transparent)`,
      }}
    />
  );
}
