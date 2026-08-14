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

/**
 * In-surface 404. Keeps the visitor on the subdomain they asked for (docs,
 * news, marketing, affiliates) instead of bouncing them to another host, and
 * offers a way back into that surface.
 */
export function SurfaceNotFound({ label }: { label: string }) {
  const path = useSurfacePath();
  return (
    <div className="page-shell flex min-h-[60vh] flex-col items-center justify-center py-24 text-center">
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-mahogany">404</p>
      <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
        This page isn’t here
      </h1>
      <p className="mt-3 max-w-md text-sm text-muted-foreground">
        The link you followed doesn’t match anything in {label}. It may have moved or never existed.
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link
          to={path("/")}
          className="interactive rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground"
        >
          Back to {label}
        </Link>
        <a
          href={urlFor("home", "/")}
          className="interactive rounded-lg border border-border px-5 py-2.5 text-sm font-medium text-foreground"
        >
          Gradr home
        </a>
      </div>
    </div>
  );
}
