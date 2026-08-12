import { useEffect, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { BrandLogo } from "@/components/BrandLogo";

/**
 * Branded boot splash.
 *
 * It is server-rendered on top of the app shell and only fades out once
 * BOTH conditions hold:
 *   1. React has hydrated on the client, and
 *   2. the router has finished loading data for the matched route.
 *
 * That ordering removes the brief fallback repaint users saw when the
 * splash disappeared before route data (and the dashboard chrome) was
 * ready. It never blocks crawlers: the SSR markup underneath it is fully
 * rendered, and the splash is aria-hidden.
 */
export function AppSplash() {
  const [hydrated, setHydrated] = useState(false);
  const routerLoading = useRouterState({
    select: (s) => s.status !== "idle" || s.isLoading || s.isTransitioning,
  });
  const [removed, setRemoved] = useState(false);

  useEffect(() => {
    // one frame after hydration so the first client paint is committed
    const id = requestAnimationFrame(() => setHydrated(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const done = hydrated && !routerLoading;

  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => setRemoved(true), 320);
    return () => clearTimeout(t);
  }, [done]);

  if (removed) return null;

  return (
    <div
      aria-hidden="true"
      data-app-splash={done ? "hiding" : "visible"}
      className={`fixed inset-0 z-[999] flex flex-col items-center justify-center gap-5 bg-background transition-opacity duration-300 ${
        done ? "pointer-events-none opacity-0" : "opacity-100"
      }`}
    >
      <BrandLogo size={64} className="animate-pulse" />
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  );
}

export default AppSplash;
