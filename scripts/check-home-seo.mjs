#!/usr/bin/env node
/**
 * CI gate: the rendered home-page HTML must carry the critical SEO and Open
 * Graph tags, and the Gradr-owned brand assets (favicon, manifest, og image).
 *
 * Usage: node scripts/check-home-seo.mjs [baseUrl]
 */
const BASE = (process.argv[2] || process.env.SEO_BASE_URL || "http://localhost:8080").replace(/\/$/, "");

const res = await fetch(`${BASE}/`, { redirect: "follow", headers: { "user-agent": "GradrSeoCI/1.0" } });
const html = await res.text();
const head = html.split("</head>")[0] || html;

const attr = (kind, key) => {
  const a = head.match(new RegExp(`<meta[^>]+${kind}=["']${key}["'][^>]*content=["']([^"']*)["']`, "i"));
  const b = head.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*${kind}=["']${key}["']`, "i"));
  return (a || b)?.[1]?.trim() || null;
};
const linkHref = (rel) => {
  const m = head.match(new RegExp(`<link[^>]+rel=["'][^"']*${rel}[^"']*["'][^>]*href=["']([^"']*)["']`, "i"));
  const n = head.match(new RegExp(`<link[^>]+href=["']([^"']*)["'][^>]*rel=["'][^"']*${rel}[^"']*["']`, "i"));
  return (m || n)?.[1]?.trim() || null;
};

const title = head.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() || null;
const description = attr("name", "description");
const ogTitle = attr("property", "og:title");
const ogDescription = attr("property", "og:description");
const ogUrl = attr("property", "og:url");
const ogImage = attr("property", "og:image");
const twitterImage = attr("name", "twitter:image");
const icon = linkHref("icon");
const manifest = linkHref("manifest");

const problems = [];
if (!res.ok) problems.push(`HTTP ${res.status}`);
if (!title || title.length < 10) problems.push("missing or too-short <title>");
if (title && !/gradr/i.test(title)) problems.push("<title> does not mention Gradr");
if (!description || description.length < 40) problems.push("missing or too-short meta description");
if (!ogTitle) problems.push("missing og:title");
if (ogTitle && title && ogTitle !== title) problems.push("og:title differs from <title>");
if (!ogDescription) problems.push("missing og:description");
if (ogDescription && description && ogDescription !== description) problems.push("og:description differs from meta description");
if (!ogUrl) problems.push("missing og:url");
else if (!/^https:\/\//.test(ogUrl)) problems.push(`og:url is not absolute (${ogUrl})`);
if (!ogImage) problems.push("missing og:image");
else if (!/^https:\/\//.test(ogImage)) problems.push(`og:image is not absolute (${ogImage})`);
if (!twitterImage) problems.push("missing twitter:image");
if (!icon) problems.push("missing <link rel=icon> (Gradr favicon)");
if (!manifest) problems.push("missing <link rel=manifest>");
if (/lovable/i.test(head)) problems.push("head references 'lovable' branding");

// The og:image and favicon must actually resolve to real Gradr images.
for (const [label, url] of [["og:image", ogImage], ["favicon", icon && new URL(icon, `${BASE}/`).toString()]]) {
  if (!url) continue;
  try {
    const asset = await fetch(url);
    if (!asset.ok) problems.push(`${label} returned HTTP ${asset.status}`);
    else {
      const type = asset.headers.get("content-type") || "";
      if (!type.startsWith("image/")) problems.push(`${label} content-type is ${type || "none"}`);
      const size = (await asset.arrayBuffer()).byteLength;
      if (size < 1024) problems.push(`${label} is suspiciously small (${size} bytes)`);
    }
  } catch (err) {
    problems.push(`${label} fetch failed — ${err.message}`);
  }
}

if (problems.length) {
  console.error(`FAIL ${BASE}/\n      - ${problems.join("\n      - ")}`);
  process.exit(1);
}
console.log(`ok   ${BASE}/ — title, description, og:url, og:image, twitter:image, favicon and manifest all present.`);
