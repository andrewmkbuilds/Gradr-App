#!/usr/bin/env node
/**
 * SEO regression gate.
 *
 * Fetches the rendered HTML of every public route and asserts the invariants
 * that silently break search results when someone edits routing or metadata:
 *
 *   - exactly one <title>, description and canonical per URL
 *   - canonical and og:url self-reference the route (no homepage pinning)
 *   - titles and descriptions are unique across public routes
 *   - indexable routes are not accidentally noindexed (and vice versa)
 *   - every route ships at least one parseable JSON-LD block
 *   - sitemap.xml URLs all resolve and are not disallowed by robots.txt
 *
 * Usage: node scripts/seo-regression-check.mjs [baseUrl]
 */

const BASE = (process.argv[2] || process.env.SEO_BASE_URL || "http://localhost:8080").replace(/\/$/, "");
const ORIGIN = "https://gradr.me";

/** Public, indexable routes. */
const PUBLIC_ROUTES = [
  "/",
  "/landing",
  "/pricing",
  "/affiliate",
  "/ai-resume-builder",
  "/ats-resume-checker",
  "/ai-interview-coach",
  "/blog",
  "/blog/ai-resume-optimization",
  "/career-advice",
  "/job-search",
  "/terms",
  "/privacy",
  "/refund-policy",
  "/cookie-policy",
  "/dpa",
];

/** Routes that must stay out of the index. */
const NOINDEX_ROUTES = ["/auth", "/forgot-password", "/reset-password", "/settings", "/billing"];

const problems = [];
const fail = (route, msg) => problems.push(`${route}: ${msg}`);

const countAll = (html, re) => [...html.matchAll(re)].length;
const head = (html) => html.split("</head>")[0] || html;

const metaContent = (h, kind, key) => {
  const a = h.match(new RegExp(`<meta[^>]+${kind}=["']${key}["'][^>]*content=["']([^"']*)["']`, "i"));
  const b = h.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*${kind}=["']${key}["']`, "i"));
  return (a || b)?.[1]?.trim() || null;
};

async function fetchHead(route) {
  const res = await fetch(`${BASE}${route}`, {
    redirect: "follow",
    headers: { "user-agent": "GradrSeoRegression/1.0" },
  });
  const html = await res.text();
  return { res, html, h: head(html) };
}

const titles = new Map();
const descriptions = new Map();

for (const route of PUBLIC_ROUTES) {
  const { res, html, h } = await fetchHead(route);
  if (!res.ok) {
    fail(route, `HTTP ${res.status}`);
    continue;
  }

  const title = h.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() || null;
  const description = metaContent(h, "name", "description");
  const canonical = h.match(/<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']*)["']/i)?.[1] || null;
  const ogUrl = metaContent(h, "property", "og:url");
  const robots = metaContent(h, "name", "robots") || "";

  if (!title || title.length < 10) fail(route, "missing or too-short <title>");
  if (countAll(h, /<title[^>]*>/gi) !== 1) fail(route, "expected exactly one <title>");
  if (!description || description.length < 40) fail(route, "missing or too-short meta description");
  if (countAll(h, /<meta[^>]+name=["']description["']/gi) !== 1)
    fail(route, "expected exactly one meta description");
  if (countAll(h, /<link[^>]+rel=["']canonical["']/gi) !== 1) fail(route, "expected exactly one canonical");

  const expected = `${ORIGIN}${route === "/" ? "/" : route}`;
  if (canonical && canonical.replace(/\/$/, "") !== expected.replace(/\/$/, ""))
    fail(route, `canonical points at ${canonical}, expected ${expected}`);
  if (ogUrl && ogUrl.replace(/\/$/, "") !== expected.replace(/\/$/, ""))
    fail(route, `og:url points at ${ogUrl}, expected ${expected}`);
  if (/noindex/i.test(robots)) fail(route, "public route is marked noindex");

  for (const [label, value, store] of [
    ["title", title, titles],
    ["description", description, descriptions],
  ]) {
    if (!value) continue;
    if (store.has(value)) fail(route, `duplicate ${label} shared with ${store.get(value)}`);
    else store.set(value, route);
  }

  const blocks = [...html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)];
  if (blocks.length === 0) fail(route, "no JSON-LD block");
  for (const [i, block] of blocks.entries()) {
    try {
      const parsed = JSON.parse(block[1]);
      const nodes = parsed["@graph"] ?? [parsed];
      for (const node of nodes) {
        if (!node["@type"]) fail(route, `JSON-LD[${i}] node missing @type`);
      }
    } catch {
      fail(route, `JSON-LD[${i}] is not valid JSON`);
    }
  }
}

for (const route of NOINDEX_ROUTES) {
  const { res, h } = await fetchHead(route);
  if (!res.ok) {
    fail(route, `HTTP ${res.status}`);
    continue;
  }
  const robots = metaContent(h, "name", "robots") || "";
  if (!/noindex/i.test(robots)) fail(route, "private route is missing noindex");
}

// Sitemap and robots consistency.
const sitemapRes = await fetch(`${BASE}/sitemap.xml`);
const sitemap = await sitemapRes.text();
if (!sitemapRes.ok) fail("/sitemap.xml", `HTTP ${sitemapRes.status}`);
const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
if (locs.length === 0) fail("/sitemap.xml", "no <loc> entries");

const robotsRes = await fetch(`${BASE}/robots.txt`);
const robotsTxt = await robotsRes.text();
if (!robotsTxt.includes(`${ORIGIN}/sitemap.xml`)) fail("/robots.txt", "does not advertise the sitemap");
const disallowed = [...robotsTxt.matchAll(/^Disallow:\s*(\S+)/gim)].map((m) => m[1]);
for (const loc of locs) {
  const path = loc.replace(ORIGIN, "");
  const blocked = disallowed.find((rule) => rule !== "/" && path.startsWith(rule));
  if (blocked) fail("/sitemap.xml", `${path} is disallowed by robots.txt rule ${blocked}`);
}

// Sample a subset of sitemap URLs to make sure they actually render.
const sample = locs.filter((_, i) => i % Math.max(1, Math.ceil(locs.length / 12)) === 0);
for (const loc of sample) {
  const path = loc.replace(ORIGIN, "") || "/";
  const res = await fetch(`${BASE}${path}`, { redirect: "follow" });
  if (!res.ok) fail("/sitemap.xml", `${path} returned HTTP ${res.status}`);
}

console.log(`Checked ${PUBLIC_ROUTES.length} public routes, ${NOINDEX_ROUTES.length} private routes and ${locs.length} sitemap URLs against ${BASE}`);
if (problems.length) {
  console.error(`\n${problems.length} SEO regression(s):\n - ${problems.join("\n - ")}`);
  process.exit(1);
}
console.log("No SEO regressions.");
