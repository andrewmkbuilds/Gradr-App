/**
 * Gradr typographic motion primitives.
 *
 * All of them share the project easing/spring tokens in `@/lib/motion` and
 * degrade to plain static text under `prefers-reduced-motion`.
 */
import { Children, useMemo, type ReactNode } from "react";
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { ease, spring } from "@/lib/motion";

/* ------------------------------- split text ------------------------------- */

type SplitProps = {
  text: string;
  className?: string;
  delay?: number;
  step?: number;
  as?: "span" | "h1" | "h2" | "h3" | "p";
  /** Play on mount instead of on scroll — for above-the-fold headlines. */
  immediate?: boolean;
};

/** Word-by-word rise from behind a mask. The signature Gradr headline reveal. */
export function MaskedHeading({ text, className = "", delay = 0, step = 0.055, as = "h2", immediate = false }: SplitProps) {
  const reduce = useReducedMotion();
  const Tag = motion[as];
  const words = useMemo(() => text.split(" "), [text]);

  if (reduce) return <Tag className={className}>{text}</Tag>;

  return (
    <Tag className={className} aria-label={text}>
      {words.map((word, i) => (
        <span key={`${word}-${i}`} className="inline-block overflow-hidden py-[0.06em] align-bottom" aria-hidden>
          <motion.span
            className="inline-block"
            initial={{ y: "110%" }}
            {...(immediate
              ? { animate: { y: "0%" } }
              : { whileInView: { y: "0%" }, viewport: { once: true, margin: "-12%" } })}
            transition={{ delay: delay + i * step, duration: 0.75, ease: ease.entrance }}
          >
            {word}
            {i < words.length - 1 ? "\u00A0" : ""}
          </motion.span>
        </span>
      ))}
    </Tag>
  );
}

/** Per-character stagger, for short strings only (labels, eyebrows, numbers). */
export function SplitText({ text, className = "", delay = 0, step = 0.02, as = "span" }: SplitProps) {
  const reduce = useReducedMotion();
  const Tag = motion[as];
  if (reduce) return <Tag className={className}>{text}</Tag>;
  return (
    <Tag className={className} aria-label={text}>
      {text.split("").map((ch, i) => (
        <motion.span
          key={`${ch}-${i}`}
          aria-hidden
          className="inline-block whitespace-pre"
          initial={{ opacity: 0, y: 8 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-10%" }}
          transition={{ delay: delay + i * step, duration: 0.4, ease: ease.standard }}
        >
          {ch}
        </motion.span>
      ))}
    </Tag>
  );
}

/** Line/paragraph that resolves out of a blur. Good for ledes under a headline. */
export function BlurText({
  children, className = "", delay = 0,
}: { children: ReactNode; className?: string; delay?: number }) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, filter: "blur(10px)", y: 12 }}
      whileInView={{ opacity: 1, filter: "blur(0px)", y: 0 }}
      viewport={{ once: true, margin: "-10%" }}
      transition={{ delay, duration: 0.8, ease: ease.entrance }}
    >
      {children}
    </motion.div>
  );
}

/* ------------------------------ decorated text ----------------------------- */

/** Cyan→blue gradient emphasis. Use on at most a few words per screen. */
export function GradientText({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={`bg-clip-text text-transparent ${className}`}
      style={{
        backgroundImage:
          "linear-gradient(100deg, hsl(var(--primary)) 0%, hsl(210 90% 62%) 45%, hsl(266 70% 68%) 100%)",
      }}
    >
      {children}
    </span>
  );
}

/** A slow specular sweep across text. Reserved for badges and small labels. */
export function ShinyText({ children, className = "" }: { children: ReactNode; className?: string }) {
  const reduce = useReducedMotion();
  if (reduce) return <span className={className}>{children}</span>;
  return (
    <span className={`relative inline-block overflow-hidden ${className}`}>
      {children}
      <motion.span
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: "linear-gradient(100deg, transparent 35%, hsl(var(--primary) / 0.35) 50%, transparent 65%)",
        }}
        initial={{ x: "-120%" }}
        animate={{ x: ["-120%", "120%"] }}
        transition={{ duration: 4.5, repeat: Infinity, repeatDelay: 2.5, ease: "easeInOut" }}
      />
    </span>
  );
}

/** Cycles through phrases in place with a spring rise. */
export function TextLoop({
  items, index, className = "",
}: { items: string[]; index: number; className?: string }) {
  const reduce = useReducedMotion();
  const value = items[index % items.length] ?? "";
  if (reduce) return <span className={className}>{value}</span>;
  return (
    <span className={`relative inline-grid overflow-hidden align-bottom ${className}`}>
      {items.map((item, i) => (
        <motion.span
          key={item}
          className="col-start-1 row-start-1 whitespace-nowrap"
          initial={false}
          animate={{
            y: i === index % items.length ? "0%" : "-110%",
            opacity: i === index % items.length ? 1 : 0,
          }}
          transition={spring.smooth}
          aria-hidden={i !== index % items.length}
        >
          {item}
        </motion.span>
      ))}
    </span>
  );
}

/* ------------------------------- scroll text ------------------------------- */

/** Content that floats up and settles as it scrolls through the viewport. */
export function ScrollFloat({
  children, className = "", distance = 40,
}: { children: ReactNode; className?: string; distance?: number }) {
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll();
  const y = useTransform(scrollYProgress, [0, 1], [distance, -distance]);
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div className={className} style={{ y }}>
      {children}
    </motion.div>
  );
}

/** Staggered list where each child slides in from the left edge. */
export function AnimatedList({
  children, className = "", step = 0.07,
}: { children: ReactNode; className?: string; step?: number }) {
  const reduce = useReducedMotion();
  return (
    <div className={className}>
      {Children.toArray(children).map((child, i) => (
        <motion.div
          key={i}
          initial={reduce ? false : { opacity: 0, x: -14 }}
          whileInView={reduce ? undefined : { opacity: 1, x: 0 }}
          viewport={{ once: true, margin: "-8%" }}
          transition={{ delay: i * step, duration: 0.5, ease: ease.entrance }}
        >
          {child}
        </motion.div>
      ))}
    </div>
  );
}
