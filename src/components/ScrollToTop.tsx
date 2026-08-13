import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useReducedMotionPref } from "@/hooks/useMotionPreference";

/**
 * Resets scroll on every route change: the window (the app's single primary
 * scroll container) plus any opt-in nested [data-scroll-container].
 */
export function ScrollToTop() {
  const { pathname, hash } = useLocation();
  const reduced = useReducedMotionPref();

  useEffect(() => {
    const behavior: ScrollBehavior = reduced ? "auto" : "smooth";

    if (hash) {
      // Let the target render, then bring the anchored section into view.
      const id = hash.slice(1);
      const raf = requestAnimationFrame(() => {
        document.getElementById(id)?.scrollIntoView({ behavior, block: "start" });
      });
      return () => cancelAnimationFrame(raf);
    }

    window.scrollTo({ top: 0, left: 0, behavior });
    document.querySelectorAll<HTMLElement>("[data-scroll-container]").forEach((el) => {
      el.scrollTo({ top: 0, left: 0, behavior });
    });
  }, [pathname, hash, reduced]);


  return null;
}

export default ScrollToTop;
