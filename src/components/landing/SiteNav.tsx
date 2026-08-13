/**
 * Gradr marketing navigation.
 *
 * A floating glass pill that compacts and deepens on scroll, with a spring
 * indicator that follows the section currently in view and a staggered
 * full-screen menu on mobile.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion, useScroll, useMotionValueEvent } from "framer-motion";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/BrandLogo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { MotionQuickToggle } from "@/components/motion/MotionQuickToggle";
import { Magnetic } from "@/components/motion";
import { useMotionPrefs } from "@/hooks/useMotionPrefs";
import { ease, spring } from "@/lib/motion";

export type NavItem = { label: string; href: string };

/** Inputs that mean "the user took the wheel back" from a click-driven scroll. */
const USER_SCROLL_EVENTS = ["wheel", "touchstart", "keydown", "pointerdown"] as const;



type Props = {
  items: NavItem[];
  authed: boolean;
  onStart: () => void;
  onLogin: () => void;
  onOpenApp: () => void;
};

export function SiteNav({ items, authed, onStart, onLogin, onOpenApp }: Props) {
  const systemReduce = useReducedMotion();
  const { reduceMotion } = useMotionPrefs();
  // OS `prefers-reduced-motion` OR the in-app toggle: either one means every
  // nav interaction resolves instantly — no smooth scroll, no deferred spy.
  const reduce = Boolean(systemReduce) || reduceMotion;
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const { scrollY } = useScroll();
  const navRef = useRef<HTMLElement>(null);

  /**
   * While a click-driven smooth scroll is running, the observer would fire for
   * every section swept past and drag the indicator backwards. `lockRef` holds
   * the clicked target so scroll-spy updates are ignored until the scroll
   * settles; a rapid second click simply overwrites the target, so the navbar
   * can never get stuck on a stale section.
   */
  const lockRef = useRef<string | null>(null);
  const releaseRef = useRef<(() => void) | null>(null);
  const reduceRef = useRef(reduce);
  reduceRef.current = reduce;

  useMotionValueEvent(scrollY, "change", (v) => setScrolled(v > 16));

  const goTo = useCallback((href: string, opts?: { closeMenu?: boolean }) => {
    if (!href.startsWith("#")) return false;
    const el = document.getElementById(href.slice(1));
    if (!el) return false;
    const instant = reduceRef.current;

    // Paint the active state on the same frame as the click — never wait for
    // the scroll animation to finish, and never for the menu exit animation.
    setActive(href);
    lockRef.current = href;
    releaseRef.current?.();

    if (opts?.closeMenu) {
      setOpen(false);
      // Release the scroll lock imperatively instead of waiting for the
      // `open` effect to flush: otherwise `overflow: hidden` is still on the
      // body when we scroll and the jump is swallowed. This removes the
      // frame-timing race between closing the menu and scrolling.
      document.body.style.overflow = "";
    }

    el.scrollIntoView({ behavior: instant ? "auto" : "smooth", block: "start" });
    history.replaceState(null, "", href);

    // Move focus to the section so keyboard users land where they navigated;
    // `tabindex=-1` keeps it out of the tab order afterwards.
    if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1");
    el.focus({ preventScroll: true });

    // Reduced motion means the scroll already completed synchronously, so the
    // spy can never fight us — drop the lock immediately.
    if (instant) {
      lockRef.current = null;
      return true;
    }

    // The lock lifts on the next *user-initiated* scroll rather than on a
    // timer, so the programmatic scroll can never hand the indicator back to a
    // section it merely passed through, and neighbouring anchors that share a
    // scroll position keep the section the user actually chose.
    const release = () => {
      if (lockRef.current === href) lockRef.current = null;
      for (const evt of USER_SCROLL_EVENTS) window.removeEventListener(evt, release);
      releaseRef.current = null;
    };
    releaseRef.current = release;
    for (const evt of USER_SCROLL_EVENTS) {
      window.addEventListener(evt, release, { passive: true, once: true });
    }
    return true;
  }, []);

  /**
   * Keyboard navigation for the nav list: Enter/Space activate (matching the
   * click path exactly, so the active state syncs identically), arrows move
   * between items, Home/End jump to the ends. Tab order is untouched.
   */
  const onItemKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLAnchorElement>, href: string, closeMenu?: boolean) => {
      if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
        if (goTo(href, { closeMenu })) e.preventDefault();
        return;
      }
      if (!["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
      const list = e.currentTarget.closest("ul");
      if (!list) return;
      const links = Array.from(list.querySelectorAll<HTMLAnchorElement>("a[data-nav-item]"));
      const i = links.indexOf(e.currentTarget);
      if (i < 0) return;
      e.preventDefault();
      const next =
        e.key === "Home" ? 0
        : e.key === "End" ? links.length - 1
        : e.key === "ArrowRight" || e.key === "ArrowDown" ? (i + 1) % links.length
        : (i - 1 + links.length) % links.length;
      links[next]?.focus();
    },
    [goTo],
  );



  /**
   * Scroll-spy. Some landing sections are zero-height anchor markers, so
   * intersection ratios can't rank them — position does. One passive scroll
   * listener, coalesced into a single rAF, picks the last section whose top
   * has crossed the reading line and only calls setState when the winner
   * actually changes, so there is at most one re-render per section boundary.
   */
  useEffect(() => {
    const hrefs = items.map((i) => i.href).filter((h) => h.startsWith("#"));
    if (!hrefs.length) return;

    let frame = 0;
    let tops: { href: string; top: number }[] = [];

    const measure = () => {
      tops = hrefs
        .map((href) => {
          const el = document.getElementById(href.slice(1));
          if (!el) return null;
          return { href, top: el.getBoundingClientRect().top + window.scrollY };
        })
        .filter(Boolean)
        .sort((a, b) => a!.top - b!.top) as { href: string; top: number }[];
    };

    const pick = () => {
      frame = 0;
      if (lockRef.current || !tops.length) return;
      const line = window.scrollY + window.innerHeight * 0.32;
      // Bottom of the page always belongs to the final section.
      const atEnd = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
      let next = window.scrollY < tops[0].top - window.innerHeight * 0.32 ? null : tops[0].href;
      if (atEnd) next = tops[tops.length - 1].href;
      else for (const s of tops) if (s.top <= line) next = s.href;
      setActive((prev) => (prev === next ? prev : next));
    };

    // Under reduced motion the spy updates synchronously on every scroll
    // event: no rAF deferral, so the active state never trails the viewport.
    const schedule = () => {
      if (reduce) { if (frame) { cancelAnimationFrame(frame); frame = 0; } pick(); return; }
      if (!frame) frame = requestAnimationFrame(pick);
    };
    const onResize = () => { measure(); schedule(); };

    measure();
    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", onResize);
    // Late-loading media/fonts shift section offsets; re-measure when they do.
    const ro = new ResizeObserver(onResize);
    ro.observe(document.body);

    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", onResize);
      ro.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [items, reduce]);



  useEffect(() => () => { releaseRef.current?.(); }, []);


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
        className="glass-float elev-3 mx-auto flex w-full max-w-6xl items-center justify-between gap-3 rounded-2xl border px-3 sm:px-4"
      >
        <a
          href="#hero"
          onClick={(e) => { if (goTo("#hero")) e.preventDefault(); }}
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
                  data-nav-item={n.href}
                  data-active={isActive ? "true" : "false"}
                  aria-current={isActive ? "true" : undefined}
                  onClick={(e) => { if (goTo(n.href)) e.preventDefault(); }}
                  onKeyDown={(e) => onItemKeyDown(e, n.href)}
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
          aria-controls="mobile-menu"
          onClick={() => setOpen((v) => !v)}

        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </motion.nav>

      <AnimatePresence>
        {open && (
          <motion.div
            key="mobile-menu"
            id="mobile-menu"
            role="navigation"
            aria-label="Mobile"
            data-mobile-menu

            initial={reduce ? false : { opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, y: -8 }}
            transition={reduce ? { duration: 0 } : { duration: 0.25, ease: ease.standard }}
            className="glass-float elev-4 mx-auto mt-2 w-full max-w-6xl overflow-hidden rounded-2xl border border-border p-3 lg:hidden"
          >
            <ul>
              {items.map((n, i) => (
                <motion.li
                  key={n.label}
                  initial={reduce ? false : { opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={reduce ? { duration: 0 } : { delay: 0.04 * i, duration: 0.3, ease: ease.entrance }}
                >
                  <a
                    href={n.href}
                    data-nav-item={n.href}
                    data-active={active === n.href ? "true" : "false"}
                    aria-current={active === n.href ? "true" : undefined}
                    onClick={(e) => {
                      // One call owns both the active state and the close, so
                      // there is no ordering race between them.
                      if (goTo(n.href, { closeMenu: true })) e.preventDefault();
                      else setOpen(false);
                    }}
                    onKeyDown={(e) => onItemKeyDown(e, n.href, true)}

                    className={`flex min-h-12 items-center rounded-xl px-3 text-[15px] transition-colors hover:bg-secondary/60 hover:text-foreground ${
                      active === n.href ? "bg-secondary/50 text-foreground" : "text-muted-foreground"
                    }`}
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
