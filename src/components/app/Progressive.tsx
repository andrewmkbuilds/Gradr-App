import { useEffect, useRef, useState, type ReactNode } from "react";
import { SkeletonBlock } from "@/components/states";
import { cn } from "@/lib/utils";

interface ProgressiveProps {
  children: ReactNode;
  /** Placeholder rendered until the section is promoted. */
  fallback?: ReactNode;
  /** Reserved height so promotion never shifts the page. */
  minHeight?: number | string;
  /** How far ahead of the viewport to start rendering. */
  rootMargin?: string;
  /** Render regardless of viewport once the main thread goes idle. */
  idleAfterMs?: number;
  className?: string;
}

const requestIdle: (cb: () => void, timeout: number) => number =
  typeof window !== "undefined" && "requestIdleCallback" in window
    ? (cb, timeout) => (window as unknown as { requestIdleCallback: (c: () => void, o: { timeout: number }) => number })
        .requestIdleCallback(cb, { timeout })
    : (cb, timeout) => window.setTimeout(cb, timeout);

/**
 * Progressive section boundary.
 *
 * Renders a reserved-height placeholder first, then mounts the real subtree
 * once the section approaches the viewport — or once the main thread is idle,
 * whichever comes first. Above-the-fold content therefore paints immediately
 * while heavy panels (charts, AI surfaces, long lists) stream in behind it.
 */
export function Progressive({
  children,
  fallback,
  minHeight = 220,
  rootMargin = "300px 0px",
  idleAfterMs = 900,
  className,
}: ProgressiveProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (ready) return;
    const node = ref.current;

    if (typeof IntersectionObserver === "undefined") {
      setReady(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setReady(true);
          observer.disconnect();
        }
      },
      { rootMargin },
    );
    if (node) observer.observe(node);

    // Safety net: nothing stays a placeholder forever, even off-screen.
    const idle = requestIdle(() => setReady(true), idleAfterMs);

    return () => {
      observer.disconnect();
      window.clearTimeout(idle);
    };
  }, [ready, rootMargin, idleAfterMs]);

  if (ready) return <div className={className}>{children}</div>;

  return (
    <div
      ref={ref}
      className={cn("w-full", className)}
      style={{ minHeight }}
      aria-busy="true"
      role="status"
      aria-live="polite"
    >
      <span className="sr-only">Loading section</span>
      {fallback ?? <SkeletonBlock className="h-full w-full rounded-2xl" />}
    </div>
  );
}

export default Progressive;
