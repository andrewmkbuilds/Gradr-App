#!/usr/bin/env node
/**
 * Validates that SEO metadata is present in the *initial* server-rendered
 * HTML of every public route, and that no raw "SEO fallback" body text
 * (the legacy pre-SSR #seo-shell markup) ships to users.
 *
 * Usage: node scripts/validate-seo-html.mjs [baseUrl]
 */

const BASE = process.argv[2] || process.env.SEO_BASE_URL || "http://localhost:8080";

const ROUTES = [
  "/",
  "/landing",
  "/pricing",
  "/auth",
  "/ats-resume-checker",
  "/terms",
  "/privacy",
  "/cookie-policy",
  "/refund-policy",
  "/dpa",
];

// Legacy static fallback markers that must never reach the DOM again.
const FORBIDDEN = ["id=\"seo-shell\"", "id=\"app-splash\"", "data-seo-fallback"];

const checks = [
  // Helmet renders <title data-rh="true">, so attributes must be tolerated.
  ["<title>", (h) => /<title[^>]*>[^<]{10,}<\/title>/i.test(h)],
  ["meta description", (h) => /<meta[^>]+name="description"[^>]+content="[^"]{40,}"/i.test(h)],
  ["canonical", (h) => /<link[^>]+rel="canonical"[^>]+href="https?:\/\/[^"]+"/i.test(h)],
  ["og:title", (h) => /property="og:title"/i.test(h)],
  ["og:description", (h) => /property="og:description"/i.test(h)],
  ["og:image (absolute)", (h) => /property="og:image"[^>]+content="https:\/\//i.test(h)],
  ["twitter:card", (h) => /name="twitter:card"/i.test(h)],
  ["structured data", (h) => /application\/ld\+json/i.test(h)],
];

let failures = 0;

async function checkRoute(path) {
  const res = await fetch(new URL(path, BASE), { redirect: "follow" });
  const html = await res.text();
  const problems = [];

  if (!res.ok) problems.push(`HTTP ${res.status}`);
  for (const [name, fn] of checks) if (!fn(html)) problems.push(`missing ${name}`);
  for (const marker of FORBIDDEN) if (html.includes(marker)) problems.push(`leaked ${marker}`);

  if (problems.length) {
    failures++;
    console.error(`FAIL ${path}\n      - ${problems.join("\n      - ")}`);
  } else {
    console.log(`ok   ${path}`);
  }
}

async function checkFile(path, required) {
  const res = await fetch(new URL(path, BASE));
  const body = await res.text();
  const missing = required.filter((r) => !body.includes(r));
  if (!res.ok || missing.length) {
    failures++;
    console.error(`FAIL ${path} — ${!res.ok ? `HTTP ${res.status}` : `missing ${missing.join(", ")}`}`);
  } else {
    console.log(`ok   ${path}`);
  }
}

console.log(`Validating SEO HTML against ${BASE}\n`);
for (const r of ROUTES) await checkRoute(r);
await checkFile("/robots.txt", ["User-agent"]);
await checkFile("/sitemap.xml", ["<urlset", "<loc>"]);

console.log("");
if (failures) {
  console.error(`${failures} check(s) failed.`);
  process.exit(1);
}
console.log("All SEO HTML checks passed.");
