/**
 * Single source of truth for the app's response security headers.
 *
 * Shared by three consumers so they can never drift apart:
 *  - `src/server.ts`            applies them to every SSR response
 *  - `src/test/securityHeaders.test.ts` unit-tests the policy
 *  - the OAuth forensics runtime check fetches `/auth` and the OAuth paths in
 *    production and asserts the very same expectations.
 *
 * The CSP is deliberately restricted to directives that cannot break loading of
 * third-party scripts (Paddle, Google, PostHog, Sentry): it locks down framing,
 * base URI, plugin content and form submission targets, and upgrades insecure
 * requests. That is the part attackers and phishing reports care about, and it
 * is safe to enforce without a resource allow-list audit.
 */

/** Paths whose headers matter most for OAuth phishing / false-positive reports. */
export const OAUTH_SENSITIVE_PATHS = [
  "/auth",
  "/auth?mode=signup",
  "/forgot-password",
  "/reset-password",
  "/.lovable/oauth/consent",
] as const;

export const CONTENT_SECURITY_POLICY = [
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'self'",
  // OAuth and checkout post back to their own origins; nothing else may be a
  // form target, which is what stops credential-harvesting injections.
  "form-action 'self' https://accounts.google.com https://appleid.apple.com https://login.microsoftonline.com https://*.supabase.co https://*.lovable.app",
  "upgrade-insecure-requests",
].join("; ");

export const STRICT_TRANSPORT_SECURITY = "max-age=63072000; includeSubDomains; preload";
export const REFERRER_POLICY = "strict-origin-when-cross-origin";

/** Headers that leak stack/build details without any functional purpose. */
export const DISCLOSURE_HEADERS = [
  "x-powered-by",
  "x-aspnet-version",
  "x-aspnetmvc-version",
  "x-generator",
  "x-runtime",
  "x-version",
  "x-deployment-id",
  "x-nitro-prerender",
  "x-sveltekit-page",
];

// camera/microphone/display-capture stay enabled for the AI Mock Interview.
// `payment` is intentionally omitted so the Paddle checkout overlay keeps working.
export const PERMISSIONS_POLICY = [
  "camera=(self)",
  "microphone=(self)",
  "display-capture=(self)",
  "geolocation=()",
  "usb=()",
  "serial=()",
  "bluetooth=()",
  "midi=()",
  "idle-detection=()",
  "browsing-topics=()",
].join(", ");

/**
 * Applies the policy to a header bag in place. `secure` is false for plain-HTTP
 * local development, where HSTS would poison the developer's browser.
 */
export function applySecurityHeaders(headers: Headers, options: { secure: boolean }): Headers {
  for (const name of DISCLOSURE_HEADERS) headers.delete(name);

  if (!headers.has("content-security-policy")) {
    headers.set("content-security-policy", CONTENT_SECURITY_POLICY);
  }
  if (options.secure && !headers.has("strict-transport-security")) {
    headers.set("strict-transport-security", STRICT_TRANSPORT_SECURITY);
  }
  if (!headers.has("referrer-policy")) headers.set("referrer-policy", REFERRER_POLICY);
  if (!headers.has("x-content-type-options")) headers.set("x-content-type-options", "nosniff");
  if (!headers.has("permissions-policy")) headers.set("permissions-policy", PERMISSIONS_POLICY);
  if (!headers.has("x-frame-options")) headers.set("x-frame-options", "SAMEORIGIN");
  if (!headers.has("x-permitted-cross-domain-policies")) {
    headers.set("x-permitted-cross-domain-policies", "none");
  }
  // "allow-popups" is required: Google OAuth and Paddle open popup windows.
  if (!headers.has("cross-origin-opener-policy")) {
    headers.set("cross-origin-opener-policy", "same-origin-allow-popups");
  }
  return headers;
}

export interface HeaderVerdict {
  ok: boolean;
  problems: string[];
  observed: Record<string, string | null>;
}

const OBSERVED_KEYS = [
  "content-security-policy",
  "strict-transport-security",
  "referrer-policy",
  "x-content-type-options",
  "x-frame-options",
  "permissions-policy",
  "cross-origin-opener-policy",
  ...DISCLOSURE_HEADERS,
];

/**
 * Verifies a *live* response's headers against the policy. Used by the runtime
 * check, the Playwright suite and the unit test, so a regression in production
 * is reported in exactly the same words everywhere.
 */
export function evaluateSecurityHeaders(
  headers: Headers,
  options: { secure?: boolean } = {},
): HeaderVerdict {
  const secure = options.secure !== false;
  const get = (name: string) => headers.get(name);
  const problems: string[] = [];

  const csp = get("content-security-policy");
  if (!csp) problems.push("Missing Content-Security-Policy");
  else {
    for (const directive of ["frame-ancestors", "base-uri", "object-src", "form-action"]) {
      if (!csp.includes(directive)) problems.push(`CSP is missing "${directive}"`);
    }
    if (/frame-ancestors\s+\*/.test(csp)) problems.push("CSP allows framing by any origin");
  }

  const hsts = get("strict-transport-security");
  if (secure) {
    if (!hsts) problems.push("Missing Strict-Transport-Security");
    else {
      const maxAge = Number(hsts.match(/max-age=(\d+)/i)?.[1] ?? 0);
      if (maxAge < 15552000) problems.push("HSTS max-age is below 180 days");
      if (!/includeSubDomains/i.test(hsts)) problems.push("HSTS is missing includeSubDomains");
    }
  }

  const referrer = get("referrer-policy");
  const allowedReferrer = ["strict-origin-when-cross-origin", "no-referrer", "same-origin", "strict-origin"];
  if (!referrer) problems.push("Missing Referrer-Policy");
  else if (!allowedReferrer.includes(referrer.trim().toLowerCase())) {
    problems.push(`Referrer-Policy "${referrer}" leaks the full URL cross-origin`);
  }

  if (get("x-content-type-options")?.toLowerCase() !== "nosniff") {
    problems.push("Missing X-Content-Type-Options: nosniff");
  }
  if (!get("x-frame-options")) problems.push("Missing X-Frame-Options");

  for (const name of DISCLOSURE_HEADERS) {
    if (get(name)) problems.push(`Technology disclosure header "${name}" is present`);
  }

  const observed: Record<string, string | null> = {};
  for (const key of OBSERVED_KEYS) observed[key] = get(key);

  return { ok: problems.length === 0, problems, observed };
}
