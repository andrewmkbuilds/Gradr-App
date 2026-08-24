/**
 * Canonical URL normalisation.
 *
 * Search engines treat "/AI-Interview-Coach", "/ai-interview-coach/" and
 * "/interview-coach" as three separate URLs. Every variant redirects to one
 * canonical path in the router, and `canonicalPath()` guarantees the
 * <link rel="canonical"> tag always points at that same single URL even if a
 * variant is somehow rendered directly.
 */

/** Alias path (lowercased, no trailing slash) -> canonical path. */
export const CANONICAL_ALIASES: Record<string, string> = {
  "/interview-coach": "/ai-interview-coach",
  "/ai-mock-interview": "/ai-interview-coach",
  "/mock-interview": "/ai-interview-coach",
  "/ai-interview-practice": "/ai-interview-coach",
  "/career-coach": "/ai-career-coach",
  "/ai-career-coaching": "/ai-career-coach",
  "/ai-career-guidance": "/ai-career-coach",
  "/ai-career-advisor": "/ai-career-coach",
  "/resume-checker": "/ats-resume-checker",
  "/ats-checker": "/ats-resume-checker",
  "/job-tracker": "/job-application-tracker",
  "/application-tracker": "/job-application-tracker",
  "/job-application-tracking": "/job-application-tracker",
};

/** Lowercase, strip a trailing slash, then resolve any known alias. */
export function canonicalPath(pathname: string): string {
  let path = pathname.toLowerCase();
  if (path.length > 1 && path.endsWith("/")) path = path.replace(/\/+$/, "");
  if (path === "") path = "/";
  return CANONICAL_ALIASES[path] ?? path;
}

/** True when the current URL is a non-canonical variant that must redirect. */
export function needsCanonicalRedirect(pathname: string): boolean {
  return canonicalPath(pathname) !== pathname;
}
