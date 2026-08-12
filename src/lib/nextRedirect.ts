/**
 * Central handling of the `?next=` post-authentication destination.
 *
 * Every entry point (protected-route bounce, sign-in, sign-up, OAuth,
 * email confirmation, password reset) reads and writes the destination
 * through these helpers so the rules stay identical everywhere.
 *
 * Safety rules for a destination:
 *  - must be a same-origin, absolute path (starts with a single "/")
 *  - never protocol-relative ("//evil.com") or backslash-escaped ("/\evil.com")
 *  - never an auth page itself (would bounce the user in a loop)
 *  - bounded length, so a crafted link can't stuff the URL bar
 */

const MAX_LENGTH = 512;

/** Auth-owned routes are never valid destinations — they'd cause a redirect loop. */
const AUTH_PATHS = ["/auth", "/forgot-password", "/reset-password"];

export function sanitizeNext(raw: string | null | undefined): string | null {
  if (!raw) return null;

  let value = raw.trim();
  if (!value || value.length > MAX_LENGTH) return null;

  // A single decode pass catches links that were encoded twice on the way in.
  if (value.includes("%2F") || value.includes("%2f")) {
    try {
      value = decodeURIComponent(value);
    } catch {
      return null;
    }
  }

  // Normalize backslashes: some browsers treat "/\host" as protocol-relative.
  if (value.includes("\\")) return null;
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  if (value.includes("\n") || value.includes("\r")) return null;

  const path = value.split("?")[0].split("#")[0].replace(/\/+$/, "") || "/";
  if (AUTH_PATHS.includes(path)) return null;
  if (path === "/") return null; // "/" is already the default landing spot

  return value;
}

/** Reads and validates `next` out of a location search string. */
export function readNext(search: string): string | null {
  return sanitizeNext(new URLSearchParams(search).get("next"));
}

/** Where to send the user after auth — the requested destination, or the app root. */
export function resolveNext(search: string): string {
  return readNext(search) ?? "/";
}

/**
 * Builds the full destination (path + query + hash) for a route the user was
 * bounced away from, so deep links keep their parameters.
 */
export function nextFromLocation(location: {
  pathname: string;
  search?: string;
  hash?: string;
}): string | null {
  return sanitizeNext(`${location.pathname}${location.search ?? ""}${location.hash ?? ""}`);
}

/** In-app path to the sign-in page, carrying the destination when there is one. */
export function authPath(next: string | null | undefined): string {
  const safe = sanitizeNext(next);
  return safe ? `/auth?next=${encodeURIComponent(safe)}` : "/auth";
}

/**
 * Absolute URL used for `emailRedirectTo` and OAuth `redirect_uri`.
 *
 * It always points at `/auth` (a public route) rather than the destination
 * itself: the session has to be established from the URL fragment/code first,
 * and only then does the app forward to `next`.
 */
export function authCallbackUrl(next: string | null | undefined): string {
  if (typeof window === "undefined") return "/auth";
  return `${window.location.origin}${authPath(next)}`;
}

/**
 * Pulls an auth error out of the callback URL (Supabase puts it in the query
 * string or the hash fragment depending on the flow) and clears it from the
 * address bar so a refresh doesn't re-surface it.
 */
export function consumeAuthCallbackError(): string | null {
  if (typeof window === "undefined") return null;

  const query = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const description = query.get("error_description") ?? hash.get("error_description");
  const code = query.get("error") ?? hash.get("error");
  if (!description && !code) return null;

  query.delete("error");
  query.delete("error_code");
  query.delete("error_description");
  const rest = query.toString();
  window.history.replaceState(
    {},
    "",
    `${window.location.pathname}${rest ? `?${rest}` : ""}`,
  );

  return description?.replace(/\+/g, " ") ?? code ?? null;
}
