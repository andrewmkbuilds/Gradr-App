import { useEffect, useState } from "react";

/**
 * Scroll transformation state for chrome (top bars, rails).
 *
 * Reports whether the document has moved past a threshold and whether the
 * user is scrolling down, so the app bar can compress, deepen its glass and
 * gain a hairline exactly once instead of animating on every frame.
 */
export function useScrollTransform(threshold = 8) {
  const [scrolled, setScrolled] = useState(false);
  const [direction, setDirection] = useState<"up" | "down">("up");

  useEffect(() => {
    let last = window.scrollY;
    let frame = 0;

    const read = () => {
      frame = 0;
      const y = window.scrollY;
      setScrolled(y > threshold);
      if (Math.abs(y - last) > 4) {
        setDirection(y > last ? "down" : "up");
        last = y;
      }
    };

    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(read);
    };

    read();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [threshold]);

  return { scrolled, direction };
}
