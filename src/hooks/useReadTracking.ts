import { useEffect, useRef } from "react";
import { trackEvent } from "@/lib/analytics";

/**
 * Content read tracking.
 *
 * Fires `content_scroll_depth` at 25/50/75/100% (once each) and a
 * `content_read` event once the reader has both passed 75% depth and spent
 * enough time on the page to plausibly have read it. Gives us a conversion
 * signal for guides, blog posts and job landing pages.
 */
const DEPTHS = [25, 50, 75, 100] as const;

export function useReadTracking(article: string, opts: { readSeconds?: number } = {}) {
  const readSeconds = opts.readSeconds ?? 30;
  const fired = useRef<Set<number>>(new Set());
  const readFired = useRef(false);
  const startedAt = useRef(Date.now());

  useEffect(() => {
    if (!article || typeof window === "undefined") return;
    fired.current = new Set();
    readFired.current = false;
    startedAt.current = Date.now();

    let ticking = false;
    const measure = () => {
      ticking = false;
      const doc = document.documentElement;
      const scrollable = doc.scrollHeight - window.innerHeight;
      const pct =
        scrollable <= 0 ? 100 : Math.min(100, Math.round(((window.scrollY || 0) / scrollable) * 100));

      for (const depth of DEPTHS) {
        if (pct >= depth && !fired.current.has(depth)) {
          fired.current.add(depth);
          trackEvent("content_scroll_depth", { article, depth, location: window.location.pathname });
        }
      }

      const seconds = Math.round((Date.now() - startedAt.current) / 1000);
      if (!readFired.current && pct >= 75 && seconds >= readSeconds) {
        readFired.current = true;
        trackEvent("content_read", { article, seconds, location: window.location.pathname });
      }
    };

    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    const interval = window.setInterval(measure, 5000);

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.clearInterval(interval);
    };
  }, [article, readSeconds]);
}
