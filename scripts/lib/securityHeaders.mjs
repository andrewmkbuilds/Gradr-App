/**
 * Shared security-header expectations for the CI gate and the runtime tests.
 *
 * Two tiers, because two different systems own the response:
 *
 *   REQUIRED_HEADERS  — headers the hosting edge does set today (HSTS,
 *     Referrer-Policy, X-Content-Type-Options) plus the document-level CSP the
 *     repository ships in index.html. A regression here is our bug: fail.
 *
 *   EDGE_ONLY_HEADERS — CSP with frame-ancestors, CSP-Report-Only,
 *     X-Frame-Options and Permissions-Policy. These can only be set as real
 *     response headers by the hosting/CDN layer; no change in this repository
 *     can produce them (`<meta http-equiv>` ignores frame-ancestors, report-only
 *     and cannot express XFO). They are reported as warnings so the gap stays
 *     visible without failing a pipeline that cannot fix it.
 *     See docs/security-headers.md.
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

/** Directives the report-only policy must exercise before we consider enforcing. */
export const REPORT_ONLY_DIRECTIVES = [
  "default-src",
  "script-src",
  "style-src",
  "font-src",
  "img-src",
  "media-src",
  "connect-src",
  "frame-src",
  "worker-src",
  "manifest-src",
  "base-uri",
  "form-action",
  "object-src",
];

/** Origins the app actually talks to. Missing any of these breaks enforcement. */
export const REPORT_ONLY_ORIGINS = [
  "https://*.supabase.co",
  "wss://*.supabase.co",
  "https://*.lovable.cloud",
  "https://accounts.google.com",
  "https://*.paddle.com",
  "https://fonts.gstatic.com",
  "blob:",
];

/** Headers the platform does serve — a regression here fails the build. */
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
    name: "referrer-policy",
    test: (v) => ["strict-origin-when-cross-origin", "no-referrer", "same-origin", "strict-origin"].includes((v || "").toLowerCase()),
    describe: "strict referrer policy",
  },
  { name: "x-content-type-options", test: (v) => (v || "").toLowerCase() === "nosniff", describe: "nosniff" },
];

/** Headers only the hosting edge can set — reported, never blocking. */
export const EDGE_ONLY_HEADERS = [
  {
    name: "content-security-policy",
    test: (v) => Boolean(v) && /frame-ancestors/.test(v),
    describe: "frame-ancestors (header-only directive)",
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
    name: "x-frame-options",
    test: (v) => ["deny", "sameorigin"].includes((v || "").toLowerCase()),
    describe: "DENY or SAMEORIGIN",
  },
  { name: "permissions-policy", test: (v) => Boolean(v) && /geolocation=\(\)/.test(v), describe: "restrictive permissions policy" },
];

/**
 * Document-level CSP shipped in index.html. `<meta http-equiv>` honours these
 * three directives, so they are enforceable from the repository.
 */
export const META_CSP_DIRECTIVES = [
  { pattern: /base-uri\s+'self'/, describe: "base-uri 'self'" },
  { pattern: /object-src\s+'none'/, describe: "object-src 'none'" },
  { pattern: /form-action\s+/, describe: "form-action present" },
];

/** Extracts the `<meta http-equiv="content-security-policy">` content, if any. */
export function metaCspFromHtml(html) {
  const match = /<meta[^>]+http-equiv=["']content-security-policy["'][^>]*>/i.exec(html || "");
  if (!match) return null;
  return /content=["']([^"']+)["']/i.exec(match[0])?.[1] ?? null;
}


/**
 * Fetches one route and evaluates every expectation.
 * @param {string} url absolute URL
 */
export async function checkRoute(url) {
  const passes = [];
  const failures = [];
  const warnings = [];

  let res;
  try {
    res = await fetch(url, { redirect: "manual", headers: { "User-Agent": "gradr-security-header-check" } });
  } catch (error) {
    return {
      url,
      status: 0,
      passes,
      warnings,
      failures: [`request failed: ${error instanceof Error ? error.message : String(error)}`],
    };
  }

  for (const rule of REQUIRED_HEADERS) {
    const value = res.headers.get(rule.name);
    if (value && rule.test(value)) passes.push(`${rule.name}: ${rule.describe}`);
    else failures.push(`${rule.name} missing or invalid (${rule.describe}); got: ${value ?? "<absent>"}`);
  }

  for (const rule of EDGE_ONLY_HEADERS) {
    const value = res.headers.get(rule.name);
    if (value && rule.test(value)) passes.push(`${rule.name}: ${rule.describe}`);
    else warnings.push(`${rule.name} not set by the edge (${rule.describe}) — see docs/security-headers.md`);
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

    // Document-level CSP: shipped by this repository, so it is enforceable.
    const metaCsp = metaCspFromHtml(html);
    if (!metaCsp) {
      failures.push('document CSP missing: index.html must carry <meta http-equiv="Content-Security-Policy">');
    } else {
      const missing = META_CSP_DIRECTIVES.filter((d) => !d.pattern.test(metaCsp));
      if (missing.length > 0) failures.push(`document CSP is missing ${missing.map((d) => d.describe).join(", ")}`);
      else passes.push("document CSP: base-uri 'self', object-src 'none', form-action present");
    }
  }

  return { url, status: res.status, passes, warnings, failures };
}

/** Runs {@link checkRoute} for every guarded route under a base URL. */
export async function securityHeaderReport(baseUrl) {
  const routes = [];
  for (const path of ROUTES) {
    routes.push(await checkRoute(`${baseUrl}${path}`));
  }
  return { baseUrl, routes, ok: routes.every((r) => r.failures.length === 0) };
}

