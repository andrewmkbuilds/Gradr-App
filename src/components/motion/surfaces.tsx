/**
 * Gradr surface primitives — glass cards with cursor light, animated borders,
 * and bento layouts. Pointer effects are automatically disabled on touch
 * devices and under `prefers-reduced-motion` (see `useDepthEnabled`).
 */
import { useRef, useState, type ReactNode } from "react";
import { motion, useMotionTemplate, useMotionValue, useReducedMotion, useSpring } from "framer-motion";
import { ease, spring } from "@/lib/motion";
import { useDepthEnabled } from "./depth";

/* ------------------------------- glare hover ------------------------------- */

type SurfaceProps = {
  children: ReactNode;
  className?: string;
  /** Border-glow accent hue; defaults to the Gradr cyan primary. */
  glow?: string;
};

/**
 * Glass card whose border lights up around the cursor and whose surface picks
 * up a soft specular glare. The workhorse card for the marketing site.
 */
export function GlareCard({ children, className = "", glow = "var(--primary)" }: SurfaceProps) {
  const enabled = useDepthEnabled();
  const ref = useRef<HTMLDivElement>(null);
  const mx = useMotionValue(-999);
  const my = useMotionValue(-999);
  const [hovered, setHovered] = useState(false);

  const glare = useMotionTemplate`radial-gradient(240px circle at ${mx}px ${my}px, hsl(${glow} / 0.16), transparent 65%)`;
  const border = useMotionTemplate`radial-gradient(320px circle at ${mx}px ${my}px, hsl(${glow} / 0.55), transparent 60%)`;

  return (
    <div
      ref={ref}
      className={`group relative overflow-hidden rounded-2xl border border-border/70 bg-card/60 backdrop-blur-xl transition-shadow duration-300 ${className}`}
      onPointerMove={(e) => {
        if (!enabled) return;
        const r = e.currentTarget.getBoundingClientRect();
        mx.set(e.clientX - r.left);
        my.set(e.clientY - r.top);
      }}
      onPointerEnter={() => enabled && setHovered(true)}
      onPointerLeave={() => {
        setHovered(false);
        mx.set(-999);
        my.set(-999);
      }}
    >
      {/* animated border light */}
      <motion.span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 transition-opacity duration-300"
        style={{
          background: border,
          opacity: hovered ? 1 : 0,
          WebkitMask: "linear-gradient(#000, #000) content-box, linear-gradient(#000, #000)",
          WebkitMaskComposite: "xor",
          maskComposite: "exclude",
          padding: 1,
        }}
      />
      {/* specular glare */}
      <motion.span
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: glare, opacity: hovered ? 1 : 0 }}
      />
      {/* top reflection */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{ background: "linear-gradient(to right, transparent, hsl(0 0% 100% / 0.18), transparent)" }}
      />
      <div className="relative">{children}</div>
    </div>
  );
}

/* ------------------------------- border glow ------------------------------- */

/** Card with a slowly rotating conic border. Use for one hero-level element. */
export function BorderGlow({ children, className = "" }: SurfaceProps) {
  const reduce = useReducedMotion();
  return (
    <div className={`relative rounded-2xl p-px ${className}`}>
      <motion.span
        aria-hidden
        className="absolute inset-0 rounded-2xl opacity-70"
        style={{
          background:
            "conic-gradient(from 0deg, transparent 0deg, hsl(var(--primary) / 0.65) 60deg, transparent 140deg, transparent 220deg, hsl(210 90% 60% / 0.5) 290deg, transparent 360deg)",
        }}
        animate={reduce ? undefined : { rotate: 360 }}
        transition={{ duration: 14, repeat: Infinity, ease: "linear" }}
      />
      <div className="relative h-full rounded-[15px] bg-card/85 backdrop-blur-xl">{children}</div>
    </div>
  );
}

/* --------------------------------- lift ----------------------------------- */

/** Spring-loaded hover elevation for any block-level element. */
export function HoverLift({
  children, className = "", amount = 6,
}: { children: ReactNode; className?: string; amount?: number }) {
  const enabled = useDepthEnabled();
  return (
    <motion.div
      className={className}
      whileHover={enabled ? { y: -amount } : undefined}
      transition={spring.snappy}
    >
      {children}
    </motion.div>
  );
}

/* ------------------------------- magic bento ------------------------------- */

export type BentoItem = {
  title: string;
  copy: string;
  icon?: ReactNode;
  /** Tailwind col/row span classes for the lg breakpoint. */
  span?: string;
  footer?: ReactNode;
};

/**
 * Mixed-size feature grid. The whole grid shares one pointer position so the
 * light reads as a single sheet moving under all the cards.
 */
export function MagicBento({ items, className = "" }: { items: BentoItem[]; className?: string }) {
  const enabled = useDepthEnabled();
  const mx = useMotionValue(-9999);
  const my = useMotionValue(-9999);
  const sheet = useMotionTemplate`radial-gradient(420px circle at ${mx}px ${my}px, hsl(var(--primary) / 0.10), transparent 70%)`;

  return (
    <div
      className={`relative grid gap-4 sm:grid-cols-2 lg:grid-cols-3 ${className}`}
      onPointerMove={(e) => {
        if (!enabled) return;
        const r = e.currentTarget.getBoundingClientRect();
        mx.set(e.clientX - r.left);
        my.set(e.clientY - r.top);
      }}
      onPointerLeave={() => {
        mx.set(-9999);
        my.set(-9999);
      }}
    >
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-0 rounded-3xl"
        style={{ background: sheet }}
      />
      {items.map((item, i) => (
        <motion.div
          key={item.title}
          className={`relative z-10 ${item.span ?? ""}`}
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "0px 0px -8% 0px" }}
          transition={{ delay: i * 0.05, duration: 0.55, ease: ease.entrance }}
        >
          <HoverLift className="h-full" amount={4}>
            <GlareCard className="h-full p-6">
              {item.icon ? <div className="mb-4 text-primary">{item.icon}</div> : null}
              <h3 className="text-base font-semibold tracking-tight text-foreground">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.copy}</p>
              {item.footer ? <div className="mt-4">{item.footer}</div> : null}
            </GlareCard>
          </HoverLift>
        </motion.div>
      ))}
    </div>
  );
}

/* ------------------------------- scroll stack ------------------------------ */

/**
 * Sticky stack: each panel pins, then the next one slides over it. Falls back
 * to a plain vertical list when motion is reduced or on small screens.
 */
export function ScrollStack({
  children, className = "",
}: { children: ReactNode[]; className?: string }) {
  const reduce = useReducedMotion();
  if (reduce) {
    return <div className={`space-y-6 ${className}`}>{children}</div>;
  }
  return (
    <div className={className}>
      {children.map((child, i) => (
        <div
          key={i}
          className="sticky top-24 mb-6"
          style={{ zIndex: i + 1, transform: `translateZ(0)` }}
        >
          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.98 }}
            whileInView={{ opacity: 1, y: 0, scale: 1 }}
            viewport={{ once: true, margin: "0px 0px -15% 0px" }}
            transition={{ duration: 0.6, ease: ease.entrance }}
          >
            {child}
          </motion.div>
        </div>
      ))}
    </div>
  );
}
