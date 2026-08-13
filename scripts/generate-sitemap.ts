// Runs before `vite dev` and `vite build`; writes public/sitemap.xml.
import { writeFileSync } from "fs";
import { resolve } from "path";
import { GUIDES, guidePath } from "../src/content/guides";
import { JOB_LANDINGS, jobLandingPath } from "../src/content/jobLandings";

const BASE_URL = "https://gradr.me";

interface SitemapEntry {
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
const entries: SitemapEntry[] = [
  { path: "/", changefreq: "weekly", priority: "1.0" },
  { path: "/pricing", changefreq: "monthly", priority: "0.9" },
  { path: "/affiliate", changefreq: "monthly", priority: "0.6" },
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



function generateSitemap(items: SitemapEntry[]) {
  const urls = items.map((e) =>
    [
      `  <url>`,
      `    <loc>${BASE_URL}${e.path}</loc>`,
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

writeFileSync(resolve("public/sitemap.xml"), generateSitemap(entries));
console.log(`sitemap.xml written (${entries.length} entries)`);
