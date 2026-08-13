#!/usr/bin/env node
/**
 * CI brand/metadata crawler.
 *
 * Crawls every public route and asserts the head metadata a crawler receives
 * matches the current Gradr Yacht Club spec: og:title, og:description,
 * og:image (absolute, versioned, route-specific), twitter:card and friends,
 * plus favicons and every PWA manifest field. Exits non-zero on any drift so
 * a deploy can be blocked.
 *
 * Usage: node scripts/brand-metadata-ci.mjs [baseUrl]
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const spec = JSON.parse(readFileSync(path.join(ROOT, "src/config/brand-spec.json"), "utf8"));
const BASE = (process.argv[2] || process.env.BRAND_BASE_URL || spec.brand.origin).replace(/\/$/, "");

const NEEDLES = [...spec.forbidden.strings, ...spec.forbidden.ogFilenames];

const decode = (v) =>
  v
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, c) => String.fromCharCode(Number(c)));

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function meta(html, kind, key) {
  const a = html.match(new RegExp(`<meta[^>]+${kind}=["']${esc(key)}["'][^>]*content=["']([^"']*)["']`, "i"));
  const b = html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*${kind}=["']${esc(key)}["']`, "i"));
  const hit = a || b;
  return hit ? decode(hit[1].trim()) : null;
}

function link(html, rel) {
  const a = html.match(new RegExp(`<link[^>]+rel=["'][^"']*${esc(rel)}[^"']*["'][^>]*href=["']([^"']*)["']`, "i"));
  const b = html.match(new RegExp(`<link[^>]+href=["']([^"']*)["'][^>]*rel=["'][^"']*${esc(rel)}[^"']*["']`, "i"));
  const hit = a || b;
  return hit ? decode(hit[1].trim()) : null;
}

let failures = 0;
const report = (label, problems) => {
  if (problems.length) {
    failures++;
    console.error(`FAIL ${label}\n      - ${problems.join("\n      - ")}`);
  } else {
    console.log(`ok   ${label}`);
  }
};

console.log(`Verifying Gradr branding metadata against ${BASE}\n`);

for (const route of spec.routes) {
  const url = `${BASE}${route.path}`;
  const problems = [];
  let html = "";
  try {
    const res = await fetch(url, { redirect: "follow", headers: { "user-agent": "GradrBrandCI/1.0" } });
    if (!res.ok) problems.push(`HTTP ${res.status}`);
    html = await res.text();
  } catch (err) {
    problems.push(`fetch failed — ${err.message}`);
  }

  const head = html.split("</head>")[0] || html;
  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  const title = titleMatch ? decode(titleMatch[1].trim()) : null;
  const description = meta(head, "name", "description");
  const ogTitle = meta(head, "property", "og:title");
  const ogDescription = meta(head, "property", "og:description");
  const ogImage = meta(head, "property", "og:image");
  const ogUrl = meta(head, "property", "og:url");
  const ogSiteName = meta(head, "property", "og:site_name");
  const twitterCard = meta(head, "name", "twitter:card");
  const twitterImage = meta(head, "name", "twitter:image");
  const canonical = link(head, "canonical");
  const manifestHref = link(head, "manifest");
  // og:image is always canonical-origin absolute, even when crawling a preview host.
  const expectedOg = `${spec.brand.origin}${route.ogImage}?v=${spec.ogVersion}`;

  if (!title || title.length < 10) problems.push("missing or too-short <title>");
  if (title && !title.includes(spec.brand.name)) problems.push(`<title> does not mention ${spec.brand.name}`);
  if (!description || description.length < 40) problems.push("missing or too-short meta description");
  if (!ogTitle) problems.push("missing og:title");
  if (ogTitle && title && ogTitle !== title) problems.push("og:title differs from <title>");
  if (!ogDescription) problems.push("missing og:description");
  if (ogDescription && description && ogDescription !== description) problems.push("og:description differs from meta description");
  if (!ogImage) problems.push("missing og:image");
  else if (!ogImage.startsWith("https://")) problems.push(`og:image is not absolute (${ogImage})`);
  else if (ogImage !== expectedOg) problems.push(`og:image is ${ogImage} (expected ${expectedOg})`);
  if (!ogUrl) problems.push("missing og:url");
  if (ogSiteName !== spec.brand.name) problems.push(`og:site_name is "${ogSiteName}" (expected "${spec.brand.name}")`);
  if (twitterCard !== "summary_large_image") problems.push(`twitter:card is "${twitterCard}"`);
  if (!twitterImage) problems.push("missing twitter:image");
  else if (ogImage && twitterImage !== ogImage) problems.push("twitter:image differs from og:image");
  if (!canonical || !canonical.startsWith("http")) problems.push("canonical missing or relative");
  if (!manifestHref) problems.push("missing <link rel=manifest>");
  if (route.indexable === false && !(meta(head, "name", "robots") || "").includes("noindex")) {
    problems.push("private route is missing noindex");
  }

  const lower = head.toLowerCase();
  for (const needle of NEEDLES) {
    if (lower.includes(needle.toLowerCase())) problems.push(`legacy branding "${needle}" in head`);
  }

  report(route.path, problems);
}

/* ------------------------------- manifest ------------------------------- */
{
  const url = `${BASE}${spec.manifestPath}`;
  const problems = [];
  let data = null;
  try {
    const res = await fetch(url);
    if (!res.ok) problems.push(`HTTP ${res.status}`);
    const text = await res.text();
    for (const needle of NEEDLES) {
      if (text.toLowerCase().includes(needle.toLowerCase())) problems.push(`legacy branding "${needle}"`);
    }
    try {
      data = JSON.parse(text);
    } catch {
      problems.push("manifest is not valid JSON");
    }
  } catch (err) {
    problems.push(`fetch failed — ${err.message}`);
  }
  if (data) {
    for (const key of ["name", "short_name", "description", "theme_color", "background_color", "start_url"]) {
      if (data[key] !== spec.manifest[key]) {
        problems.push(`${key} is "${data[key]}" (expected "${spec.manifest[key]}")`);
      }
    }
    for (const icon of spec.manifest.requiredIcons) {
      if (!(data.icons || []).some((i) => i.src === icon)) problems.push(`missing icon ${icon}`);
    }
  }
  report(spec.manifestPath, problems);
}

/* --------------------------------- icons -------------------------------- */
for (const icon of spec.icons) {
  const problems = [];
  try {
    const res = await fetch(`${BASE}${icon}`);
    if (!res.ok) problems.push(`HTTP ${res.status}`);
    else {
      const buf = await res.arrayBuffer();
      if (buf.byteLength < 256) problems.push(`suspiciously small (${buf.byteLength} bytes)`);
      const type = res.headers.get("content-type") || "";
      if (!type.startsWith("image/")) problems.push(`unexpected content-type ${type || "none"}`);
    }
  } catch (err) {
    problems.push(`fetch failed — ${err.message}`);
  }
  report(icon, problems);
}

console.log("");
if (failures) {
  console.error(`${failures} branding check(s) failed against ${BASE}.`);
  process.exit(1);
}
console.log("All routes, manifest and icons match the current Gradr Yacht Club branding.");
