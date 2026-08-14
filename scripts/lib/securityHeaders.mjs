/**
 * Shared security-header expectations for the CI gate and the runtime tests.
 *
 * These describe headers the production edge already sets. The point of the
 * check is regression protection: if a deploy drops HSTS/CSP/Referrer-Policy,
 * or starts advertising the stack again, we fail loudly.
 */

/** Routes worth guarding: public entry, auth, and OAuth-adjacent paths. */
export const ROUTES = ["/", "/auth", "/auth/callback", "/pricing", "/landing"];

/** Headers that must never appear — they disclose stack/version details. */
export const DISCLOSURE_HEADERS = [
  "x-powered-by",
  "x-aspnet-version",
  "x-aspnetmvc-version",
  "x-generator",
  "x-drupal-cache",
  "x-runtime",
  "x-version",
  "x-served-by",
];

/** `Server:` values we allow. A bare CDN token is fine; a version string is not. */
const SERVER_VERSION_RE = /\d+\.\d+/;

/** Required headers and the predicate each must satisfy. */
export const REQUIRED_HEADERS = [
  {
    name: "strict-transport-security",
    test: (v) => {
      const maxAge = Number(/max-age=(\d+)/.exec(v || "")?.[1] ?? 0);
      return maxAge >= 15552000 && /includeSubDomains/i.test(v || "");
    },
    describe: "max-age >= 180 days and includeSubDomains",
  },
  {
    name: "content-security-policy",
    test: (v) =>
      Boolean(v) &&
      /frame-ancestors/.test(v) &&
      /base-uri\s+'self'/.test(v) &&
      /object-src\s+'none'/.test(v) &&
      /form-action/.test(v),
    describe: "frame-ancestors, base-uri 'self', object-src 'none', form-action present",
  },
  {
    name: "content-security-policy-report-only",
    test: (v) =>
      Boolean(v) &&
      /default-src\s+'self'/.test(v) &&
      /(report-uri|report-to)/.test(v) &&
      // Directives that must be observed before we can ever enforce.
      REPORT_ONLY_DIRECTIVES.every((d) => new RegExp(`(^|;)\\s*${d}\\s`).test(v)) &&
      // Origins the app genuinely needs; a missing one would break at enforcement.
      REPORT_ONLY_ORIGINS.every((o) => v.includes(o)),
    describe: "report-only policy covering our directives, required origins and a reporting endpoint",
  },
  {
    name: "referrer-policy",
    test: (v) => ["strict-origin-when-cross-origin", "no-referrer", "same-origin", "strict-origin"].includes((v || "").toLowerCase()),
    describe: "strict referrer policy",
  },
  { name: "x-content-type-options", test: (v) => (v || "").toLowerCase() === "nosniff", describe: "nosniff" },
  {
    name: "x-frame-options",
    test: (v) => ["deny", "sameorigin"].includes((v || "").toLowerCase()),
    describe: "DENY or SAMEORIGIN",
  },
  { name: "permissions-policy", test: (v) => Boolean(v) && /geolocation=\(\)/.test(v), describe: "restrictive permissions policy" },
];

/**
 * Fetches one route and evaluates every expectation.
 * @param {string} url absolute URL
 */
export async function checkRoute(url) {
  const passes = [];
  const failures = [];

  let res;
  try {
    res = await fetch(url, { redirect: "manual", headers: { "User-Agent": "gradr-security-header-check" } });
  } catch (error) {
    return { url, status: 0, passes, failures: [`request failed: ${error instanceof Error ? error.message : String(error)}`] };
  }

  for (const rule of REQUIRED_HEADERS) {
    const value = res.headers.get(rule.name);
    if (value && rule.test(value)) passes.push(`${rule.name}: ${rule.describe}`);
    else failures.push(`${rule.name} missing or invalid (${rule.describe}); got: ${value ?? "<absent>"}`);
  }

  for (const header of DISCLOSURE_HEADERS) {
    const value = res.headers.get(header);
    if (value) failures.push(`technology disclosure header present: ${header}: ${value}`);
  }
  if (!failures.some((f) => f.startsWith("technology disclosure"))) {
    passes.push("no technology/version disclosure headers");
  }

  const server = res.headers.get("server");
  if (server && SERVER_VERSION_RE.test(server)) failures.push(`Server header discloses a version: ${server}`);

  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("text/html")) {
    const html = await res.text();
    if (/<meta[^>]+name=["']generator["']/i.test(html)) failures.push("HTML contains <meta name=\"generator\">");
    else passes.push('no <meta name="generator"> in HTML');
  }

  return { url, status: res.status, passes, failures };
}

/** Runs {@link checkRoute} for every guarded route under a base URL. */
export async function securityHeaderReport(baseUrl) {
  const routes = [];
  for (const path of ROUTES) {
    routes.push(await checkRoute(`${baseUrl}${path}`));
  }
  return { baseUrl, routes, ok: routes.every((r) => r.failures.length === 0) };
}
