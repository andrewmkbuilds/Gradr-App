import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Scroll spy for in-page anchor navigation.
 *
 * - Clicking a nav item updates the active state instantly (no waiting for the
 *   smooth-scroll animation), and observer updates are suppressed until the
 *   scroll settles so intermediate sections can't hijack the highlight.
 * - Manual scrolling resolves the active section from a single
 *   IntersectionObserver, evaluated on a rAF tick (no per-frame React state).
 */
export function useScrollSpy(hashes: string[], headerOffset = 72) {
  const [activeHash, setActiveHash] = useState<string>(hashes[0] ?? "");
  const lockedRef = useRef(false);
  const lockTimer = useRef<number | null>(null);
  const key = hashes.join("|");

  useEffect(() => {
    const ids = key.split("|").map((h) => h.replace("#", ""));
    const nodes = ids
      .map((id) => document.getElementById(id))
      .filter((n): n is HTMLElement => Boolean(n));
    if (!nodes.length) return;

    const ratios = new Map<string, number>();
    let frame = 0;

    const resolve = () => {
      frame = 0;
      if (lockedRef.current) return;
      // Prefer the visible section closest to the top of the viewport.
      let best: { id: string; top: number } | null = null;
      for (const node of nodes) {
        if ((ratios.get(node.id) ?? 0) <= 0) continue;
        const top = node.getBoundingClientRect().top - headerOffset;
        if (!best || Math.abs(top) < Math.abs(best.top)) best = { id: node.id, top };
      }
      if (best) {
        setActiveHash((prev) => (prev === `#${best!.id}` ? prev : `#${best!.id}`));
      }
    };

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) ratios.set(e.target.id, e.isIntersecting ? e.intersectionRatio : 0);
        if (!frame) frame = requestAnimationFrame(resolve);
      },
      { rootMargin: `-${headerOffset}px 0px -40% 0px`, threshold: [0, 0.01, 0.25, 0.5, 0.75, 1] },
    );
    nodes.forEach((n) => io.observe(n));

    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(resolve);
    };
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      io.disconnect();
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [key, headerOffset]);

  useEffect(() => () => {
    if (lockTimer.current) window.clearTimeout(lockTimer.current);
  }, []);

  /** Attach to anchor onClick: instant active state + offset smooth scroll. */
  const onNavClick = useCallback(
    (hash: string) => (e?: React.MouseEvent) => {
      const el = document.getElementById(hash.replace("#", ""));
      if (!el) return;
      e?.preventDefault();

      // Instant highlight, regardless of scroll animation duration.
      setActiveHash(hash);
      lockedRef.current = true;
      if (lockTimer.current) window.clearTimeout(lockTimer.current);

      const top = el.getBoundingClientRect().top + window.scrollY - headerOffset;
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      window.scrollTo({ top, behavior: reduced ? "auto" : "smooth" });
      if (history.replaceState) history.replaceState(null, "", hash);

      // Release the lock once scrolling stops (rapid clicks reset the timer).
      const release = () => {
        lockedRef.current = false;
        window.removeEventListener("scrollend", release);
        if (lockTimer.current) window.clearTimeout(lockTimer.current);
        lockTimer.current = null;
      };
      if ("onscrollend" in window) window.addEventListener("scrollend", release, { once: true });
      lockTimer.current = window.setTimeout(release, 900);
    },
    [headerOffset],
  );

  return { activeHash, onNavClick };
}
