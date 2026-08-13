/**
 * Gradr marketing navigation.
 *
 * A floating glass pill that compacts and deepens on scroll, with a spring
 * indicator that follows the section currently in view and a staggered
 * full-screen menu on mobile.
 */
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion, useScroll, useMotionValueEvent } from "framer-motion";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/BrandLogo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { MotionQuickToggle } from "@/components/motion/MotionQuickToggle";
import { Magnetic } from "@/components/motion";
import { ease, spring } from "@/lib/motion";

export type NavItem = { label: string; href: string };

type Props = {
  items: NavItem[];
  authed: boolean;
  onStart: () => void;
  onLogin: () => void;
  onOpenApp: () => void;
};

export function SiteNav({ items, authed, onStart, onLogin, onOpenApp }: Props) {
  const reduce = useReducedMotion();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const { scrollY } = useScroll();
  const navRef = useRef<HTMLElement>(null);

  useMotionValueEvent(scrollY, "change", (v) => setScrolled(v > 16));

  // Track which section owns the viewport so the pill indicator can follow it.
  useEffect(() => {
    const ids = items.map((i) => i.href).filter((h) => h.startsWith("#")).map((h) => h.slice(1));
    const nodes = ids.map((id) => document.getElementById(id)).filter(Boolean) as HTMLElement[];
    if (!nodes.length) return;
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible) setActive(`#${visible.target.id}`);
      },
      { rootMargin: "-45% 0px -50% 0px", threshold: [0, 0.25, 0.5, 1] },
    );
    nodes.forEach((n) => io.observe(n));
    return () => io.disconnect();
  }, [items]);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  return (
    <header ref={navRef} className="fixed inset-x-0 top-0 z-50 px-3 pt-3 sm:px-5 sm:pt-4">
      <motion.nav
        aria-label="Main"
        initial={false}
        animate={{
          backgroundColor: scrolled ? "hsl(var(--card) / 0.72)" : "hsl(var(--card) / 0.32)",
          borderColor: scrolled ? "hsl(var(--border))" : "hsl(var(--border) / 0.45)",
          boxShadow: scrolled
            ? "0 18px 40px -24px hsl(220 60% 2% / 0.65), inset 0 1px 0 0 hsl(0 0% 100% / 0.06)"
            : "0 0 0 0 transparent, inset 0 1px 0 0 hsl(0 0% 100% / 0.04)",
          paddingTop: scrolled ? 6 : 10,
          paddingBottom: scrolled ? 6 : 10,
        }}
        transition={reduce ? { duration: 0 } : { duration: 0.35, ease: ease.standard }}
        className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 rounded-2xl border px-3 backdrop-blur-2xl sm:px-4"
      >
        <a
          href="#hero"
          className="flex shrink-0 items-center gap-2 rounded-lg px-1 py-1 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
        >
          <BrandLogo size={26} />
          <span className="text-sm font-bold tracking-[0.26em]">GRADR</span>
        </a>

        <ul className="hidden items-center gap-1 lg:flex">
          {items.map((n) => {
            const isActive = active === n.href;
            return (
              <li key={n.label} className="relative">
                <a
                  href={n.href}
                  className={`relative block rounded-full px-3 py-1.5 text-sm transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring ${
                    isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {isActive && (
                    <motion.span
                      layoutId="nav-pill"
                      className="absolute inset-0 -z-10 rounded-full bg-primary/12 ring-1 ring-primary/25"
                      transition={reduce ? { duration: 0 } : spring.smooth}
                    />
                  )}
                  {n.label}
                </a>
              </li>
            );
          })}
        </ul>

        <div className="hidden shrink-0 items-center gap-2 md:flex">
          <MotionQuickToggle className="min-h-9 min-w-9" />
          <ThemeToggle className="min-h-9 min-w-9" />
          {authed ? (
            <Magnetic><Button size="sm" onClick={onOpenApp}>Open Gradr</Button></Magnetic>
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={onLogin}>Log in</Button>
              <Magnetic><Button size="sm" onClick={onStart}>Get started</Button></Magnetic>
            </>
          )}
        </div>

        <button
          type="button"
          className="grid h-10 w-10 place-items-center rounded-xl text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </motion.nav>

      <AnimatePresence>
        {open && (
          <motion.div
            key="mobile-menu"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25, ease: ease.standard }}
            className="mx-auto mt-2 w-full max-w-6xl overflow-hidden rounded-2xl border border-border bg-card/95 p-3 backdrop-blur-2xl lg:hidden"
          >
            <ul>
              {items.map((n, i) => (
                <motion.li
                  key={n.label}
                  initial={reduce ? false : { opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.04 * i, duration: 0.3, ease: ease.entrance }}
                >
                  <a
                    href={n.href}
                    onClick={() => setOpen(false)}
                    className="flex min-h-12 items-center rounded-xl px-3 text-[15px] text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground"
                  >
                    {n.label}
                  </a>
                </motion.li>
              ))}
            </ul>
            <div className="mt-3 flex items-center gap-2">
              <ThemeToggle className="min-h-11 min-w-11" />
              {authed ? (
                <Button className="h-11 flex-1" onClick={onOpenApp}>Open Gradr</Button>
              ) : (
                <>
                  <Button variant="outline" className="h-11 flex-1" onClick={onLogin}>Log in</Button>
                  <Button className="h-11 flex-1" onClick={onStart}>Get started</Button>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
