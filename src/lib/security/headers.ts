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

/**
 * Paths that must never be indexed. `robots.txt` only asks politely and does not
 * cover every crawler or the `/.lovable/*` and `/api/*` namespaces; the header
 * is authoritative. Credential and third-party-authorization surfaces are the
 * ones that get reported as deceptive when a crawler snapshots them.
 */
export const NOINDEX_PATH_PREFIXES = [
  "/.lovable/",
  "/api/",
  "/auth",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
  "/admin/",
  "/mcp",
] as const;

export function shouldNoIndex(pathname: string): boolean {
  return NOINDEX_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix),
  );
}


/** Where browsers POST report-only CSP violations. */
export const CSP_REPORT_PATH = "/api/public/csp-report";
export const CSP_REPORT_GROUP = "csp-endpoint";

/**
 * The *candidate* enforced policy, shipped as `Content-Security-Policy-Report-Only`.
 *
 * Nothing is blocked while this is report-only: browsers keep loading whatever
 * the page asks for and merely POST a violation report to `CSP_REPORT_PATH`.
 * We watch /admin/oauth-forensics → CSP monitor until auth (Google/Apple/
 * Microsoft + Supabase), Paddle checkout, PostHog/Sentry, the Gemini Live
 * interview socket and the installed PWA all run report-free, then this string
 * is promoted into `CONTENT_SECURITY_POLICY`.
 */
export const CONTENT_SECURITY_POLICY_REPORT_ONLY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'self'",
  // 'unsafe-inline' covers the SSR hydration payload and the splash screen;
  // 'wasm-unsafe-eval' is required by the MediaPipe vision tasks in the interview.
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://*.paddle.com https://*.posthog.com https://*.i.posthog.com https://accounts.google.com https://cdn.jsdelivr.net https://storage.googleapis.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  // Logos, company avatars and user-uploaded previews come from many hosts.
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob: data:",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  [
    "connect-src 'self' blob: data:",
    "https://*.supabase.co wss://*.supabase.co",
    "https://*.lovable.cloud wss://*.lovable.cloud",
    "https://*.posthog.com https://*.i.posthog.com",
    "https://*.sentry.io https://*.ingest.sentry.io https://*.ingest.us.sentry.io",
    "https://*.paddle.com",
    "https://accounts.google.com https://storage.googleapis.com https://cdn.jsdelivr.net",
    "https://generativelanguage.googleapis.com wss://generativelanguage.googleapis.com",
    "https://dns.google https://cloudflare-dns.com https://img.logo.dev",
  ].join(" "),
  "frame-src 'self' https://*.paddle.com https://accounts.google.com https://appleid.apple.com https://login.microsoftonline.com https://*.supabase.co",
  "form-action 'self' https://accounts.google.com https://appleid.apple.com https://login.microsoftonline.com https://*.supabase.co https://*.lovable.app",
  "upgrade-insecure-requests",
].join("; ");


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
 * The enforce-CSP flag.
 *
 * The candidate policy is only promoted from report-only to enforced by the
 * readiness gate (`scripts/csp-enforce-gate.mjs`), which requires a full week
 * with zero critical violations. Nothing else should set `CSP_ENFORCE`.
 */
export function cspEnforcementEnabled(): boolean {
  const flag = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[
    "CSP_ENFORCE"
  ];
  return flag === "1" || flag === "true";
}

/**
 * Applies the policy to a header bag in place. `secure` is false for plain-HTTP
 * local development, where HSTS would poison the developer's browser. `origin`
 * is the absolute site origin, needed by `Reporting-Endpoints`, which — unlike
 * `report-uri` — rejects relative URLs.
 */
export function applySecurityHeaders(
  headers: Headers,
  options: { secure: boolean; origin?: string; enforceCandidate?: boolean },
): Headers {
  for (const name of DISCLOSURE_HEADERS) headers.delete(name);

  const reporting = [`report-uri ${CSP_REPORT_PATH}`, `report-to ${CSP_REPORT_GROUP}`].join("; ");
  const enforceCandidate = options.enforceCandidate ?? cspEnforcementEnabled();

  if (!headers.has("content-security-policy")) {
    headers.set(
      "content-security-policy",
      enforceCandidate
        ? `${CONTENT_SECURITY_POLICY_REPORT_ONLY}; ${reporting}`
        : CONTENT_SECURITY_POLICY,
    );
  }
  // Once the candidate policy is enforced there is nothing left to trial, so the
  // report-only header is dropped rather than duplicated.
  if (!enforceCandidate && !headers.has("content-security-policy-report-only")) {
    headers.set(
      "content-security-policy-report-only",
      `${CONTENT_SECURITY_POLICY_REPORT_ONLY}; ${reporting}`,
    );
  }
  if (options.origin && !headers.has("reporting-endpoints")) {
    headers.set(
      "reporting-endpoints",
      `${CSP_REPORT_GROUP}="${options.origin}${CSP_REPORT_PATH}"`,
    );
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

/**
 * Headers the hosting edge appends after our worker returns, which we therefore
 * cannot strip. Their values are opaque digests rather than software versions,
 * so they are surfaced as notes instead of failures.
 */
export const PLATFORM_OPAQUE_HEADERS = ["x-deployment-id"];

export interface HeaderVerdict {
  ok: boolean;
  problems: string[];
  notes: string[];
  observed: Record<string, string | null>;
}


const OBSERVED_KEYS = [
  "content-security-policy",
  "content-security-policy-report-only",
  "reporting-endpoints",
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

  const reportOnly = get("content-security-policy-report-only");
  if (!reportOnly) problems.push("Missing Content-Security-Policy-Report-Only");
  else if (!reportOnly.includes("report-uri") && !reportOnly.includes("report-to")) {
    problems.push("Report-only CSP has no reporting endpoint, so breakages go unnoticed");
  }

  const notes: string[] = [];
  for (const name of DISCLOSURE_HEADERS) {
    if (!get(name)) continue;
    if (PLATFORM_OPAQUE_HEADERS.includes(name)) {
      // Injected by the hosting edge *after* our worker; the value is an opaque
      // digest, not a version, so it is reported but does not fail the check.
      notes.push(`Hosting edge adds "${name}" (opaque build digest, no version disclosed)`);
      continue;
    }
    problems.push(`Technology disclosure header "${name}" is present`);
  }

  const observed: Record<string, string | null> = {};
  for (const key of OBSERVED_KEYS) observed[key] = get(key);

  return { ok: problems.length === 0, problems, notes, observed };

}
