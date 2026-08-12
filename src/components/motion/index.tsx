/**
 * Shared motion primitives for the Gradr design system.
 *
 * Every primitive reads the user's `prefers-reduced-motion` setting and
 * degrades to a plain fade (or no motion at all) when reduced motion is on.
 * Motion tokens come from `@/lib/motion` — never inline durations here.
 */
import { forwardRef, type ReactNode, useEffect, useRef, useState } from "react";
import {
  animate,
  motion,
  useInView,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  type HTMLMotionProps,
} from "framer-motion";
import {
  contentTransition,
  ease,
  fadeUp,
  headlineWord,
  spring,
  stagger as staggerTokens,
  staggerContainer,
} from "@/lib/motion";
import { cn } from "@/lib/utils";

/* ------------------------------- primitives ------------------------------- */

type RevealProps = HTMLMotionProps<"div"> & {
  children: ReactNode;
  delay?: number;
  /** Animate on scroll into view instead of on mount. */
  onView?: boolean;
  y?: number;
};

/** Fade + lift. Mount-based by default, scroll-based with `onView`. */
export const MotionReveal = forwardRef<HTMLDivElement, RevealProps>(function MotionReveal(
  { children, delay = 0, onView = true, y = 18, className, ...rest },
  ref,
) {
  const reduce = useReducedMotion();
  const variants = reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1 } }
    : { initial: { opacity: 0, y }, animate: { opacity: 1, y: 0 } };

  return (
    <motion.div
      ref={ref}
      variants={variants}
      initial="initial"
      {...(onView
        ? { whileInView: "animate", viewport: { once: true, margin: "0px 0px -12% 0px" } }
        : { animate: "animate" })}
      transition={{ ...contentTransition, delay }}
      className={className}
      {...rest}
    >
      {children}
    </motion.div>
  );
});

/** Staggering parent. Pair with `MotionItem` children. */
export function MotionStagger({
  children,
  delay = 0,
  step = staggerTokens.base,
  className,
  onView = true,
}: {
  children: ReactNode;
  delay?: number;
  step?: number;
  className?: string;
  onView?: boolean;
}) {
  return (
    <motion.div
      variants={staggerContainer(delay, step)}
      initial="initial"
      {...(onView
        ? { whileInView: "animate", viewport: { once: true, margin: "0px 0px -10% 0px" } }
        : { animate: "animate" })}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function MotionItem({
  children,
  className,
  as = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "li" | "span";
}) {
  const reduce = useReducedMotion();
  const Tag = motion[as] as typeof motion.div;
  return (
    <Tag
      variants={reduce ? { initial: { opacity: 0 }, animate: { opacity: 1 } } : fadeUp}
      transition={contentTransition}
      className={className}
    >
      {children}
    </Tag>
  );
}

/* ------------------------------ headline text ----------------------------- */

/** Word-by-word 3D headline reveal. Renders plain text under reduced motion. */
export function AnimatedHeadline({
  text,
  className,
  delay = 0,
  as: Tag = "h1",
}: {
  text: string;
  className?: string;
  delay?: number;
  as?: "h1" | "h2" | "p";
}) {
  const reduce = useReducedMotion();
  const words = text.split(" ");

  if (reduce) return <Tag className={className}>{text}</Tag>;

  return (
    <Tag className={className} style={{ perspective: 800 }}>
      <span className="sr-only">{text}</span>
      <motion.span
        aria-hidden
        variants={staggerContainer(delay, staggerTokens.base)}
        initial="initial"
        animate="animate"
        className="inline"
      >
        {words.map((w, i) => (
          <motion.span
            key={`${w}-${i}`}
            variants={headlineWord}
            transition={{ duration: 0.6, ease: ease.entrance }}
            className="inline-block whitespace-pre will-change-transform"
          >
            {w}
            {i < words.length - 1 ? " " : ""}
          </motion.span>
        ))}
      </motion.span>
    </Tag>
  );
}

/* --------------------------------- surfaces -------------------------------- */

/** Pointer-tracked 3D tilt + parallax container for product visuals. */
export function TiltCard({
  children,
  className,
  intensity = 8,
  glare = true,
}: {
  children: ReactNode;
  className?: string;
  intensity?: number;
  glare?: boolean;
}) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);

  const rotateX = useSpring(useTransform(py, [0, 1], [intensity, -intensity]), spring.soft);
  const rotateY = useSpring(useTransform(px, [0, 1], [-intensity, intensity]), spring.soft);
  const glareX = useTransform(px, [0, 1], ["0%", "100%"]);
  const glareY = useTransform(py, [0, 1], ["0%", "100%"]);
  const glareBg = useMotionTemplate`radial-gradient(40% 40% at ${glareX} ${glareY}, hsl(var(--primary) / 0.30), transparent 70%)`;

  if (reduce) return <div className={className}>{children}</div>;

  return (
    <div className={cn("[perspective:1200px]", className)}>
      <motion.div
        ref={ref}
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          px.set((e.clientX - r.left) / r.width);
          py.set((e.clientY - r.top) / r.height);
        }}
        onPointerLeave={() => {
          px.set(0.5);
          py.set(0.5);
        }}
        style={{ rotateX, rotateY, transformStyle: "preserve-3d" }}
        className="relative will-change-transform"
      >
        {children}
        {glare && (
          <motion.div
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-2xl opacity-40 mix-blend-soft-light"
            style={{ background: glareBg }}
          />
        )}
      </motion.div>
    </div>
  );
}

/** Press/hover-reactive wrapper for CTAs and interactive cards. */
export function MotionPressable({
  children,
  className,
  ...rest
}: HTMLMotionProps<"div"> & { children: ReactNode; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      whileHover={reduce ? undefined : { y: -2, scale: 1.015 }}
      whileTap={reduce ? undefined : { scale: 0.985 }}
      transition={spring.snappy}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

/* ------------------------------ magnetic CTA ------------------------------ */

/**
 * Magnetic wrapper — the child drifts toward the pointer inside a radius,
 * then springs home on leave. Used for primary CTAs and nav actions.
 */
export function Magnetic({
  children,
  className,
  strength = 0.28,
}: {
  children: ReactNode;
  className?: string;
  strength?: number;
}) {
  const reduce = useReducedMotion();
  const x = useSpring(useMotionValue(0), spring.smooth);
  const y = useSpring(useMotionValue(0), spring.smooth);

  if (reduce) return <div className={className}>{children}</div>;

  return (
    <motion.div
      className={cn("inline-block will-change-transform", className)}
      style={{ x, y }}
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        x.set((e.clientX - (r.left + r.width / 2)) * strength);
        y.set((e.clientY - (r.top + r.height / 2)) * strength);
      }}
      onPointerLeave={() => {
        x.set(0);
        y.set(0);
      }}
    >
      {children}
    </motion.div>
  );
}

/* -------------------------------- count-up -------------------------------- */

/** Spring-driven number that counts up the first time it scrolls into view. */
export function CountUp({
  value,
  decimals = 0,
  prefix = "",
  suffix = "",
  className,
  duration = 1.1,
}: {
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
  duration?: number;
}) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -10% 0px" });
  const [shown, setShown] = useState(reduce ? value : 0);

  useEffect(() => {
    if (!inView) return;
    if (reduce) {
      setShown(value);
      return;
    }
    const controls = animate(0, value, {
      duration,
      ease: ease.entrance,
      onUpdate: (v) => setShown(v),
    });
    return () => controls.stop();
  }, [inView, value, duration, reduce]);

  return (
    <span ref={ref} className={cn("numeric", className)}>
      {prefix}
      {shown.toFixed(decimals)}
      {suffix}
    </span>
  );
}

/* -------------------------------- parallax -------------------------------- */

/** Translates its children as the page scrolls past. `speed` in px of travel. */
export function Parallax({
  children,
  speed = 60,
  className,
}: {
  children: ReactNode;
  speed?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], [speed, -speed]);

  return (
    <div ref={ref} className={className}>
      <motion.div style={reduce ? undefined : { y }} className="will-change-transform">
        {children}
      </motion.div>
    </div>
  );
}

/* ------------------------------ spotlight card ----------------------------- */

/** Card surface with a pointer-tracked light bloom. Pure GPU (opacity/gradient). */
export function SpotlightCard({
  children,
  className,
  radius = 380,
}: {
  children: ReactNode;
  className?: string;
  radius?: number;
}) {
  const reduce = useReducedMotion();
  const mx = useMotionValue(-9999);
  const my = useMotionValue(-9999);
  const bg = useMotionTemplate`radial-gradient(${radius}px circle at ${mx}px ${my}px, hsl(var(--primary) / 0.14), transparent 70%)`;

  return (
    <div
      className={cn("group relative overflow-hidden", className)}
      onPointerMove={(e) => {
        if (reduce) return;
        const r = e.currentTarget.getBoundingClientRect();
        mx.set(e.clientX - r.left);
        my.set(e.clientY - r.top);
      }}
      onPointerLeave={() => {
        mx.set(-9999);
        my.set(-9999);
      }}
    >
      {!reduce && (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          style={{ background: bg }}
        />
      )}
      <div className="relative">{children}</div>
    </div>
  );
}

/* ---------------------------- animated progress ---------------------------- */

/** Track + fill that grows from 0 when scrolled into view. */
export function MotionMeter({
  value,
  className,
  tone = "primary",
  delay = 0,
}: {
  value: number;
  className?: string;
  tone?: "primary" | "success" | "warning" | "secondary";
  delay?: number;
}) {
  const reduce = useReducedMotion();
  const toneClass = {
    primary: "bg-primary",
    success: "bg-success",
    warning: "bg-warning",
    secondary: "bg-brand-secondary",
  }[tone];

  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-secondary", className)}>
      <motion.div
        className={cn("h-full rounded-full", toneClass)}
        initial={{ width: reduce ? `${value}%` : 0 }}
        whileInView={{ width: `${value}%` }}
        viewport={{ once: true }}
        transition={{ duration: 0.9, ease: ease.entrance, delay }}
      />
    </div>
  );
}
