/**
 * Shared motion primitives for the Gradr design system.
 *
 * Every primitive reads the user's `prefers-reduced-motion` setting and
 * degrades to a plain fade (or no motion at all) when reduced motion is on.
 * Motion tokens come from `@/lib/motion` — never inline durations here.
 */
import { forwardRef, type ReactNode, useRef } from "react";
import {
  motion,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
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
