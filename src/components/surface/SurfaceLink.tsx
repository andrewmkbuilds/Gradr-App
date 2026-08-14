import { createContext, useContext, useMemo } from "react";
import { Link, Navigate, type LinkProps } from "react-router-dom";
import { type Surface, surfaceBase, urlFor } from "@/config/domains";

interface SurfaceContextValue {
  surface: Surface;
  /** Path prefix for in-surface routes ("" in production, "/docs" in preview). */
  base: string;
}

const SurfaceContext = createContext<SurfaceContextValue>({ surface: "app", base: "" });

export function SurfaceProvider({
  surface,
  children,
}: {
  surface: Surface;
  children: React.ReactNode;
}) {
  const value = useMemo(() => ({ surface, base: surfaceBase(surface) }), [surface]);
  return <SurfaceContext.Provider value={value}>{children}</SurfaceContext.Provider>;
}

export function useSurface() {
  return useContext(SurfaceContext);
}

/** Builds an in-surface path that works on both hostname and path-prefix routing. */
export function useSurfacePath() {
  const { base } = useSurface();
  return (path: string) => {
    const normalized = path.startsWith("/") ? path : `/${path}`;
    if (!base) return normalized;
    return normalized === "/" ? base : `${base}${normalized}`;
  };
}

/** Router link that stays inside the current surface. */
export function SLink({ to, ...props }: Omit<LinkProps, "to"> & { to: string }) {
  const path = useSurfacePath();
  return <Link to={path(to)} {...props} />;
}

/**
 * Link to another Gradr surface. Renders a real anchor because in production
 * this crosses an origin boundary (docs.gradr.me → app.gradr.me).
 */
export function CrossLink({
  surface,
  to = "/",
  children,
  ...props
}: React.AnchorHTMLAttributes<HTMLAnchorElement> & { surface: Surface; to?: string }) {
  return (
    <a href={urlFor(surface, to)} {...props}>
      {children}
    </a>
  );
}

/** Redirect that stays inside the current surface (base-path aware). */
export function SurfaceRedirect({ to }: { to: string }) {
  const path = useSurfacePath();
  return <Navigate to={path(to)} replace />;
}

/** Redirect to the current surface's root — used as the surface 404 fallback. */
export function SurfaceHome() {
  return <SurfaceRedirect to="/" />;
}
