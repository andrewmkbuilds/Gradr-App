/**
 * Single source of truth for the XML sitemap.
 *
 * `scripts/generate-sitemap.ts` writes `public/sitemap.xml` from these
 * entries, and `src/test/sitemap.test.ts` asserts the committed file stays in
 * sync with routing (every entry resolves to a real route, no noindexed
 * surface is advertised).
 */
import { GUIDES, guidePath } from "@/content/guides";
import { JOB_LANDINGS, jobLandingPath } from "@/content/jobLandings";

export const SITEMAP_BASE_URL = "https://gradr.me";

export interface SitemapEntry {
  path: string;
  /** Only set from a page-specific content timestamp — never build time. */
  lastmod?: string;
  changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: string;
}

// Only publicly reachable, indexable marketing/content pages belong here.
// Authenticated product surfaces and credential flows are noindexed in
// RouteSeo and disallowed in robots.txt, so listing them would only send
// crawlers to a sign-in wall.
export const SITEMAP_ENTRIES: SitemapEntry[] = [
  { path: "/", changefreq: "weekly", priority: "1.0" },
  { path: "/pricing", changefreq: "monthly", priority: "0.9" },
  { path: "/affiliate", changefreq: "monthly", priority: "0.6" },
  { path: "/ai-resume-builder", changefreq: "monthly", priority: "0.9" },
  { path: "/ats-resume-checker", changefreq: "monthly", priority: "0.9" },
  { path: "/ai-interview-coach", changefreq: "monthly", priority: "0.9" },

  { path: "/blog/ai-resume-optimization", changefreq: "monthly", priority: "0.8" },
  { path: "/career-advice", changefreq: "weekly", priority: "0.9" },
  { path: "/job-search", changefreq: "weekly", priority: "0.9" },
  { path: "/terms", changefreq: "yearly", priority: "0.4" },
  { path: "/privacy", changefreq: "yearly", priority: "0.4" },
  { path: "/refund-policy", changefreq: "yearly", priority: "0.4" },
  { path: "/cookie-policy", changefreq: "yearly", priority: "0.4" },
  { path: "/dpa", changefreq: "yearly", priority: "0.4" },
  // Career advice guides — lastmod comes from each guide's own `updated` date.
  ...GUIDES.map((guide) => ({
    path: guidePath(guide.slug),
    lastmod: guide.updated,
    changefreq: "monthly" as const,
    priority: "0.8",
  })),
  // Role x location job search pages.
  ...JOB_LANDINGS.map((landing) => ({
    path: jobLandingPath(landing.slug),
    changefreq: "weekly" as const,
    priority: "0.7",
  })),
  // Excluded intentionally (auth-gated, credential flows, or internal tools):
  // /auth, /forgot-password, /reset-password, /verify-email, /welcome
  // /resume, /jobs, /match, /pipeline, /apply, /interview, /growth
  // /settings, /billing, /affiliate/dashboard, /admin/*
];

export function generateSitemap(items: SitemapEntry[] = SITEMAP_ENTRIES): string {
  const urls = items.map((e) =>
    [
      `  <url>`,
      `    <loc>${SITEMAP_BASE_URL}${e.path}</loc>`,
      e.lastmod ? `    <lastmod>${e.lastmod}</lastmod>` : null,
      e.changefreq ? `    <changefreq>${e.changefreq}</changefreq>` : null,
      e.priority ? `    <priority>${e.priority}</priority>` : null,
      `  </url>`,
    ]
      .filter(Boolean)
      .join("\n"),
  );
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
    ...urls,
    `</urlset>`,
  ].join("\n");
}

/** Extract every `<loc>` path (origin stripped) from a sitemap document. */
export function parseSitemapPaths(xml: string): string[] {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) =>
    m[1].replace(SITEMAP_BASE_URL, "").trim(),
  );
}

/**
 * Structural validation of the generated document: well-formed URLs, unique
 * entries, absolute locs and ISO `lastmod` values.
 */
export function validateSitemap(xml: string): string[] {
  const errors: string[] = [];
  if (!xml.startsWith(`<?xml version="1.0" encoding="UTF-8"?>`)) errors.push("missing XML declaration");
  if (!xml.includes("<urlset")) errors.push("missing <urlset>");

  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  if (locs.length === 0) errors.push("sitemap contains no <loc> entries");

  const seen = new Set<string>();
  for (const loc of locs) {
    if (!loc.startsWith(`${SITEMAP_BASE_URL}/`)) errors.push(`${loc}: must be an absolute ${SITEMAP_BASE_URL} URL`);
    if (seen.has(loc)) errors.push(`${loc}: duplicate entry`);
    seen.add(loc);
  }

  for (const [, lastmod] of xml.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(lastmod) || Number.isNaN(Date.parse(lastmod))) {
      errors.push(`lastmod ${lastmod}: must be a YYYY-MM-DD date`);
    }
  }
  return errors;
}
