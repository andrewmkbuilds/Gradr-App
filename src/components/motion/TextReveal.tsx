import { motion, useReducedMotion } from "motion/react";
import { type ElementType } from "react";
import { stagger, viewportOnce, wordVariants } from "@/lib/motion/tokens";

type Props = {
  /** Plain text — split into words so the reveal stays selectable and readable. */
  text: string;
  className?: string;
  as?: ElementType;
  /** Seconds between words. */
  stride?: number;
  delay?: number;
  /** Animate immediately instead of on scroll (use for above-the-fold copy). */
  immediate?: boolean;
  /** Words rendered in the signature accent, by zero-based index. */
  accentWords?: number[];
  accentClassName?: string;
};

/**
 * Word-by-word headline reveal. Each word gets its own overflow mask so the
 * text rises out of the line rather than fading in place.
 */
export function TextReveal({
  text,
  className = "",
  as = "h2",
  stride = 0.055,
  delay = 0,
  immediate = false,
  accentWords = [],
  accentClassName = "text-brand-secondary",
}: Props) {
  const reduced = useReducedMotion();
  const Tag = motion.create(as as ElementType);
  const words = text.split(" ");

  if (reduced) {
    const Plain = as as ElementType;
    return (
      <Plain className={className}>
        {words.map((w, i) => (
          <span key={`${w}-${i}`} className={accentWords.includes(i) ? accentClassName : undefined}>
            {w}
            {i < words.length - 1 ? " " : ""}
          </span>
        ))}
      </Plain>
    );
  }

  return (
    <Tag
      className={className}
      variants={stagger(stride, delay)}
      initial="hidden"
      {...(immediate ? { animate: "show" } : { whileInView: "show", viewport: viewportOnce })}
      style={{ perspective: 800 }}
    >
      {words.map((word, i) => (
        <span
          key={`${word}-${i}`}
          className="inline-block overflow-hidden align-bottom"
          style={{ paddingBottom: "0.06em" }}
        >
          <motion.span
            variants={wordVariants}
            className={`inline-block ${accentWords.includes(i) ? accentClassName : ""}`}
            style={{ transformOrigin: "bottom center" }}
          >
            {word}
          </motion.span>
          {i < words.length - 1 ? <span className="inline-block">&nbsp;</span> : null}
        </span>
      ))}
    </Tag>
  );
}

export default TextReveal;
