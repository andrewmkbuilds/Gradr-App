/**
 * FadeContent — React Bits pattern, Gradr tuned.
 *
 * Fades (and optionally blurs / lifts) children in when they scroll into view.
 * Reduced-motion collapses to an instant, fully visible render.
 */
import { useEffect, useRef, useState, type ElementType, type ReactNode } from "react";
import { useReducedMotion } from "framer-motion";

type Props = {
  children: ReactNode;
  className?: string;
  /** ms */
  duration?: number;
  /** ms */
  delay?: number;
  blur?: boolean;
  /** px of upward travel on entrance. */
  distance?: number;
  threshold?: number;
  as?: ElementType;
};

export function FadeContent({
  children,
  className = "",
  duration = 700,
  delay = 0,
  blur = true,
  distance = 18,
  threshold = 0.12,
  as: Tag = "div",
}: Props) {
  const ref = useRef<HTMLElement>(null);
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (reduce) {
      setShown(true);
      return;
    }
    const node = ref.current;
    if (!node) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold, rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [reduce, threshold]);

  return (
    <Tag
      ref={ref}
      className={className}
      style={{
        opacity: shown ? 1 : 0,
        transform: shown || reduce ? "none" : `translate3d(0, ${distance}px, 0)`,
        filter: blur && !shown && !reduce ? "blur(8px)" : "none",
        transition: reduce
          ? "none"
          : `opacity ${duration}ms cubic-bezier(0.16,1,0.3,1) ${delay}ms, transform ${duration}ms cubic-bezier(0.16,1,0.3,1) ${delay}ms, filter ${duration}ms cubic-bezier(0.16,1,0.3,1) ${delay}ms`,
        willChange: shown ? undefined : "opacity, transform",
      }}
    >
      {children}
    </Tag>
  );
}

export default FadeContent;
