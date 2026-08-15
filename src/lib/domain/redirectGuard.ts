/**
 * Hostname-aware URL resolution and redirect validation.
 *
 * Two rules the whole app depends on:
 *
 *  1. Internal links, API callbacks and redirects use the **active hostname**.
 *     A session running on `app.gradr.me` must never be handed a
 *     `https://gradr.me/...` URL — that bounces the user across surfaces and,
 *     while hosting aliases the subdomain, loses the deep link entirely.
 *  2. Auth redirect targets (OAuth callback, password reset, email verify) are
 *     validated before they are sent to the provider. A wrong-domain target is
 *     a bug we want to fail loudly on, not silently follow.
 */
import {
  PRODUCTION_ORIGIN,
  ROOT_DOMAIN,
  type Surface,
  isProduction,
  satelliteSubdomainsLive,
  surfaceFromHost,
} from "@/config/domains";

export class RedirectDomainError extends Error {
  constructor(
    message: string,
    readonly target: string,
    readonly context: string,
  ) {
    super(message);
    this.name = "RedirectDomainError";
  }
}

function host(): string {
  return typeof window === "undefined" ? "" : window.location.hostname.toLowerCase();
}

/** Origin every internal link/API call must be built from on this host. */
export function activeOrigin(): string {
  if (typeof window === "undefined") return PRODUCTION_ORIGIN.home;
  return window.location.origin;
}

/** True for any hostname Gradr legitimately serves (prod, preview, local). */
export function isKnownHost(candidate: string): boolean {
  const h = candidate.toLowerCase();
  if (h === ROOT_DOMAIN || h.endsWith(`.${ROOT_DOMAIN}`)) return true;
  if (h.endsWith(".lovable.app") || h.endsWith(".lovableproject.com")) return true;
  if (h === "localhost" || h.endsWith(".localhost") || h === "127.0.0.1") return true;
  return h === host();
}

/**
 * Absolute URL for an internal path on the *active* hostname.
 * Use instead of hardcoding `https://gradr.me` anywhere in the app.
 */
export function internalUrl(path = "/"): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return new URL(normalized, activeOrigin() || PRODUCTION_ORIGIN.home).toString();
}

/**
 * Rewrites a URL that hardcodes the apex onto the active hostname.
 * No-op off production and for genuinely cross-surface links (docs, news, …).
 */
export function preferActiveHost(url: string): string {
  try {
    const parsed = new URL(url, activeOrigin() || PRODUCTION_ORIGIN.home);
    const current = host();
    if (!current || !isProduction(current)) return parsed.toString();
    // Only the apex gets rewritten: it is the one hosting aliases collapse to.
    if (parsed.hostname === ROOT_DOMAIN && current !== ROOT_DOMAIN) {
      parsed.hostname = current;
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

export interface RedirectAssertion {
  /** What is being validated — used in the thrown message and telemetry. */
  context: string;
  /** Surface the redirect is required to land on (defaults to any known host). */
  expectSurface?: Surface;
}

/**
 * Validates an auth redirect target. Throws `RedirectDomainError` when the URL
 * points at a host we do not serve, uses an insecure scheme in production, or
 * lands on a different surface than the flow requires.
 */
export function assertRedirectTarget(target: string, { context, expectSurface }: RedirectAssertion): string {
  let parsed: URL;
  try {
    parsed = new URL(target, activeOrigin() || PRODUCTION_ORIGIN.home);
  } catch {
    throw new RedirectDomainError(`${context}: "${target}" is not a valid URL`, target, context);
  }

  if (parsed.protocol !== "https:" && parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") {
    throw new RedirectDomainError(
      `${context}: refusing insecure redirect to ${parsed.origin}`,
      target,
      context,
    );
  }

  if (!isKnownHost(parsed.hostname)) {
    throw new RedirectDomainError(
      `${context}: ${parsed.hostname} is not a Gradr hostname`,
      target,
      context,
    );
  }

  const current = host();
  // While hosting still aliases the satellite subdomains to the primary
  // domain, every surface legitimately lives on the primary host and is routed
  // by path — surface assertions only apply once subdomains are served.
  if (expectSurface && isProduction(parsed.hostname) && satelliteSubdomainsLive(parsed.hostname)) {
    const landing = surfaceFromHost(parsed.hostname);
    if (landing !== expectSurface) {
      throw new RedirectDomainError(
        `${context}: expected the ${expectSurface} surface, got ${parsed.hostname}`,
        target,
        context,
      );
    }
  }

  // Same-origin sessions must stay on their host: an app.gradr.me flow that
  // redirects to gradr.me is the exact cross-surface bounce we guard against.
  if (
    current &&
    isProduction(current) &&
    satelliteSubdomainsLive(current) &&
    current !== ROOT_DOMAIN &&
    parsed.hostname === ROOT_DOMAIN &&
    (expectSurface ?? surfaceFromHost(current)) !== "home"
  ) {
    throw new RedirectDomainError(
      `${context}: redirect from ${current} would cross to ${ROOT_DOMAIN}`,
      target,
      context,
    );
  }

  return parsed.toString();
}

/** Convenience wrapper for OAuth callbacks — must land on the app surface. */
export function assertOAuthCallback(target: string): string {
  return assertRedirectTarget(target, { context: "OAuth callback", expectSurface: "app" });
}

/** Convenience wrapper for password recovery — must land on the app surface. */
export function assertPasswordResetTarget(target: string): string {
  return assertRedirectTarget(target, { context: "Password reset", expectSurface: "app" });
}
