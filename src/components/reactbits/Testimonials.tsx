/**
 * TestimonialRail — React Bits style staggered testimonial cards.
 *
 * Cards enter with a spring stagger, tilt slightly toward the cursor and lift
 * on hover/tap. Everything degrades to a plain fade under reduced motion.
 */
import { useRef, type ReactNode } from "react";
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from "framer-motion";
import { Quote } from "lucide-react";
import { ease, spring } from "@/lib/motion";

export type Testimonial = {
  quote: string;
  name: string;
  role: string;
  initials: string;
  metric?: string;
};

function Card({ t, index, children }: { t: Testimonial; index: number; children?: ReactNode }) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const rx = useSpring(useTransform(my, [-0.5, 0.5], [6, -6]), spring.smooth);
  const ry = useSpring(useTransform(mx, [-0.5, 0.5], [-7, 7]), spring.smooth);

  const track = (e: React.PointerEvent) => {
    if (reduce || e.pointerType !== "mouse") return;
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    mx.set((e.clientX - r.left) / r.width - 0.5);
    my.set((e.clientY - r.top) / r.height - 0.5);
  };

  const reset = () => {
    mx.set(0);
    my.set(0);
  };

  return (
    <motion.figure
      ref={ref}
      onPointerMove={track}
      onPointerLeave={reset}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 28, scale: 0.97 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={
        reduce
          ? { duration: 0.2 }
          : { delay: index * 0.09, duration: 0.7, ease: ease.entrance }
      }
      whileHover={reduce ? undefined : { y: -6 }}
      whileTap={reduce ? undefined : { scale: 0.985 }}
      style={reduce ? undefined : { rotateX: rx, rotateY: ry, transformPerspective: 900 }}
      className="group relative flex h-full flex-col justify-between overflow-hidden rounded-2xl border border-border/70 bg-card/70 p-6 backdrop-blur-xl transition-colors hover:border-primary/40"
    >
      <span
        aria-hidden
        className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 extrude rounded-full bg-primary/10 blur-2xl opacity-0 transition-opacity duration-500 group-hover:opacity-100"
      />
      <div className="relative">
        <Quote className="h-5 w-5 text-primary/70" aria-hidden />
        <blockquote className="mt-4 text-sm leading-relaxed text-foreground sm:text-[0.95rem]">
          "{t.quote}"
        </blockquote>
      </div>

      <div className="relative mt-6 flex items-center gap-3 border-t border-border/60 pt-5">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-primary/25 bg-primary/10 text-xs font-bold tracking-wide text-primary">
          {t.initials}
        </span>
        <figcaption className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{t.name}</p>
          <p className="truncate text-xs text-muted-foreground">{t.role}</p>
        </figcaption>
        {t.metric && (
          <span className="ml-auto shrink-0 rounded-full border border-primary/25 bg-primary/[0.07] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-primary">
            {t.metric}
          </span>
        )}
      </div>
      {children}
    </motion.figure>
  );
}

export function TestimonialRail({
  items,
  className = "",
}: {
  items: Testimonial[];
  className?: string;
}) {
  return (
    <div className={`grid gap-4 sm:grid-cols-2 lg:grid-cols-3 ${className}`}>
      {items.map((t, i) => (
        <Card key={t.name} t={t} index={i} />
      ))}
    </div>
  );
}

export default TestimonialRail;
