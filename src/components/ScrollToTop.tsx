import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/**
 * Resets scroll on every route change: the window (the app's single primary
 * scroll container) plus any opt-in nested [data-scroll-container].
 */
export function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    const behavior: ScrollBehavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "auto"
      : "smooth";
    window.scrollTo({ top: 0, left: 0, behavior });
    document.querySelectorAll<HTMLElement>("[data-scroll-container]").forEach((el) => {
      el.scrollTo({ top: 0, left: 0, behavior });
    });
  }, [pathname]);

  return null;
}

export default ScrollToTop;
