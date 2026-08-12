/**
 * BentoGrid — React Bits "magic bento" pattern, rebuilt on Gradr tokens.
 *
 * Mixed-size tiles with a cursor-tracked spotlight, a border glow that follows
 * the pointer, and a spring stagger on entrance. Coarse pointers and reduced
 * motion get a clean static card with no per-frame work.
 */
import { useRef, type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ease } from "@/lib/motion";

export type BentoItem = {
  title: string;
  copy: string;
  icon?: ReactNode;
  footer?: ReactNode;
  /** Tile weight — `wide` spans 2 columns, `tall` spans 2 rows on large screens. */
  span?: "default" | "wide" | "tall" | "hero";
};

const SPAN: Record<NonNullable<BentoItem["span"]>, string> = {
  default: "",
  wide: "lg:col-span-2",
  tall: "lg:row-span-2",
  hero: "lg:col-span-2 lg:row-span-2",
};

function Tile({ item, index }: { item: BentoItem; index: number }) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);

  const track = (e: React.PointerEvent<HTMLDivElement>) => {
    if (reduce || e.pointerType !== "mouse") return;
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--bento-x", `${e.clientX - r.left}px`);
    el.style.setProperty("--bento-y", `${e.clientY - r.top}px`);
    el.style.setProperty("--bento-o", "1");
  };

  const leave = () => ref.current?.style.setProperty("--bento-o", "0");

  return (
    <motion.div
      ref={ref}
      onPointerMove={track}
      onPointerLeave={leave}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 22, scale: 0.98 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, amount: 0.25 }}
      transition={reduce ? { duration: 0.2 } : { delay: index * 0.055, duration: 0.6, ease: ease.entrance }}
      whileHover={reduce ? undefined : { y: -4 }}
      whileTap={reduce ? undefined : { scale: 0.99 }}
      className={`group relative isolate flex min-h-[180px] flex-col overflow-hidden rounded-2xl border border-border/70 bg-card/60 p-5 backdrop-blur-xl transition-colors duration-300 hover:border-primary/40 sm:p-6 ${SPAN[item.span ?? "default"]}`}
      style={{ ["--bento-o" as string]: "0" }}
    >
      {/* pointer spotlight */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-[var(--bento-o)] transition-opacity duration-300"
        style={{
          background:
            "radial-gradient(280px circle at var(--bento-x, 50%) var(--bento-y, 50%), hsl(var(--primary) / 0.16), transparent 70%)",
        }}
      />
      {/* soft top sheen */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-24 bg-gradient-to-b from-foreground/[0.04] to-transparent"
      />

      {item.icon && (
        <span className="mb-4 grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-primary/25 bg-primary/10 text-primary">
          {item.icon}
        </span>
      )}

      <h3 className="font-display text-base font-semibold tracking-tight text-foreground sm:text-lg">
        {item.title}
      </h3>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.copy}</p>

      {item.footer && <div className="mt-auto pt-5">{item.footer}</div>}
    </motion.div>
  );
}

export function BentoGrid({ items, className = "" }: { items: BentoItem[]; className?: string }) {
  return (
    <div className={`grid auto-rows-[minmax(180px,auto)] gap-4 sm:grid-cols-2 lg:grid-cols-4 ${className}`}>
      {items.map((item, i) => (
        <Tile key={item.title} item={item} index={i} />
      ))}
    </div>
  );
}

export default BentoGrid;
