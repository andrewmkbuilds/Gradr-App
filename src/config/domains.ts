/**
 * Centralised subdomain (surface) architecture for Gradr.
 *
 * Gradr ships as a single React bundle that is served from several hostnames.
 * Which part of the product renders is decided by the hostname in production
 * and by a URL path prefix in local development / preview deployments, where
 * only one hostname exists.
 *
 *   Production                     Dev & preview (single host)
 *   ------------------------------ -----------------------------
 *   gradr.me            → home      /            → home + app
 *   www.gradr.me        → redirect  —
 *   app.gradr.me        → app       /            → app (authenticated)
 *   marketing.gradr.me  → marketing /marketing
 *   news.gradr.me       → news      /news
 *   docs.gradr.me       → docs      /docs
 *   affiliates.gradr.me → affiliates/affiliate
 *
 * Everything else (auth, Supabase client, design tokens, SEO helpers,
 * analytics) is shared — surfaces are route trees, not separate apps.
 */

export type Surface = "home" | "app" | "marketing" | "news" | "docs" | "affiliates";

export const SURFACES: Surface[] = ["home", "app", "marketing", "news", "docs", "affiliates"];

export const ROOT_DOMAIN = "gradr.me";

/** Canonical production origin for every surface. Used for SEO + cross-links. */
export const PRODUCTION_ORIGIN: Record<Surface, string> = {
  home: `https://${ROOT_DOMAIN}`,
  app: `https://app.${ROOT_DOMAIN}`,
  marketing: `https://marketing.${ROOT_DOMAIN}`,
  news: `https://news.${ROOT_DOMAIN}`,
  docs: `https://docs.${ROOT_DOMAIN}`,
  affiliates: `https://affiliates.${ROOT_DOMAIN}`,
};

/** Hostname label → surface (production hostname routing). */
const SUBDOMAIN_TO_SURFACE: Record<string, Surface> = {
  app: "app",
  marketing: "marketing",
  news: "news",
  docs: "docs",
  affiliates: "affiliates",
};

/**
 * Path prefix used when several surfaces share one hostname
 * (localhost, *.lovable.app previews). `home` and `app` share the root because
 * the root route already renders the landing page for signed-out visitors and
 * the dashboard for members.
 */
export const SURFACE_PATH_PREFIX: Record<Surface, string> = {
  home: "",
  app: "",
  marketing: "/marketing",
  news: "/news",
  docs: "/docs",
  affiliates: "/affiliate",
};

export type DeployEnv = "development" | "preview" | "production";

function currentHost(): string {
  if (typeof window === "undefined") return "";
  return window.location.hostname.toLowerCase();
}

/** Production = a real *.gradr.me hostname. Everything else is dev or preview. */
export function deployEnv(host: string = currentHost()): DeployEnv {
  if (!host) return "development";
  if (host === ROOT_DOMAIN || host.endsWith(`.${ROOT_DOMAIN}`)) return "production";
  if (host.endsWith(".lovable.app") || host.endsWith(".lovableproject.com")) return "preview";
  return "development";
}

export function isProduction(host: string = currentHost()): boolean {
  return deployEnv(host) === "production";
}

/**
 * Whether the satellite subdomains (app/marketing/news/docs/affiliates) are
 * actually *served* by hosting rather than redirected to the primary domain.
 *
 * Lovable serves one primary custom domain and 302s every other connected
 * domain to it. Until each subdomain is served independently, production has
 * to route surfaces by path on the primary host — otherwise cross-surface
 * links bounce (gradr.me/docs → docs.gradr.me → gradr.me) in a loop.
 * Flip this to `true` once the subdomains stop redirecting.
 */
export const SATELLITE_SUBDOMAINS_LIVE = false;

/**
 * True when one hostname has to serve every surface (dev + preview, and
 * production while the subdomains still redirect to the primary domain).
 * In that mode surfaces live behind path prefixes and cross-surface links stay
 * on the same origin, so previews never bounce to production.
 */
export function isMultiSurfaceHost(host: string = currentHost()): boolean {
  return deployEnv(host) !== "production" || !SATELLITE_SUBDOMAINS_LIVE;
}


/** The `www.` host is a pure redirect target — never a surface of its own. */
export function isWwwHost(host: string = currentHost()): boolean {
  return host === `www.${ROOT_DOMAIN}`;
}

/** Surface implied by a hostname, or null when the host is not a known subdomain. */
export function surfaceFromHost(host: string = currentHost()): Surface | null {
  if (!host.endsWith(`.${ROOT_DOMAIN}`)) {
    // Support `app.localhost`, `docs.localhost`, … for local subdomain testing.
    const [label, ...rest] = host.split(".");
    if (rest.length && rest[rest.length - 1] === "localhost") {
      return SUBDOMAIN_TO_SURFACE[label] ?? null;
    }
    return null;
  }
  const label = host.slice(0, -1 * (ROOT_DOMAIN.length + 1));
  if (!label || label === "www") return "home";
  return SUBDOMAIN_TO_SURFACE[label] ?? null;
}

/** Surface implied by a path prefix on a shared host. */
export function surfaceFromPath(pathname: string): Surface | null {
  const path = pathname.toLowerCase();
  for (const surface of ["marketing", "news", "docs", "affiliates"] as Surface[]) {
    const prefix = SURFACE_PATH_PREFIX[surface];
    if (prefix && (path === prefix || path.startsWith(`${prefix}/`))) return surface;
  }
  return null;
}

/**
 * The surface being rendered right now.
 *
 * Production resolves purely from the hostname. On shared hosts the path
 * prefix decides, defaulting to the combined home+app surface so previews and
 * local development keep working exactly as before.
 */
export function currentSurface(pathname?: string): Surface {
  const host = currentHost();
  if (isProduction(host)) return surfaceFromHost(host) ?? "home";
  const path = pathname ?? (typeof window === "undefined" ? "/" : window.location.pathname);
  return surfaceFromPath(path) ?? "app";
}

/** Base path every in-surface link must be prefixed with on the current host. */
export function surfaceBase(surface: Surface, host: string = currentHost()): string {
  return isMultiSurfaceHost(host) ? SURFACE_PATH_PREFIX[surface] : "";
}

/**
 * Origin a surface is served from on the current host.
 * Production returns the real subdomain; dev/preview return the current origin.
 */
export function surfaceOrigin(surface: Surface, host: string = currentHost()): string {
  if (isProduction(host)) return PRODUCTION_ORIGIN[surface];
  if (typeof window === "undefined") return PRODUCTION_ORIGIN[surface];
  return window.location.origin;
}

/**
 * Absolute URL for a path on another surface.
 * Use this for every cross-surface link so nothing points at a Lovable URL in
 * production and nothing points at production from a preview.
 */
export function urlFor(surface: Surface, path = "/"): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const host = currentHost();
  const base = surfaceBase(surface, host);
  const suffix = normalized === "/" && base ? "" : normalized;
  return `${surfaceOrigin(surface, host)}${base}${suffix}`;
}

/** Canonical *production* URL for a path on a surface (SEO only, host-independent). */
export function canonicalUrlFor(surface: Surface, path = "/"): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${PRODUCTION_ORIGIN[surface]}${normalized === "/" ? "" : normalized}` || PRODUCTION_ORIGIN[surface];
}

/** Convenience: absolute URL of the authenticated app, optionally deep-linked. */
export function appUrl(path = "/"): string {
  return urlFor("app", path);
}
