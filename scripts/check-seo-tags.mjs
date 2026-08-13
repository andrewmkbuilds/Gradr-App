#!/usr/bin/env node
/**
 * CI gate: verifies the critical SEO / Open Graph tags are present in the
 * rendered HTML of the home page (works against dist/index.html or a served
 * origin, since the tags ship statically in index.html for crawlers).
 *
 * Usage:
 *   node scripts/check-seo-tags.mjs                    # reads dist/index.html
 *   node scripts/check-seo-tags.mjs http://localhost:8080
 */
import { readFile } from "node:fs/promises";

const EXPECTED_TITLE = "Gradr | AI Career Copilot for Resumes, Jobs & Interviews";
const EXPECTED_DESCRIPTION =
  "Gradr is your AI career copilot for building better resumes, finding the right jobs, tracking applications, and practicing interviews in one powerful workspace.";
const EXPECTED_OG_URL = "https://gradr.me/";

const target = process.argv[2];

function decode(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function metaContent(html, attr, name) {
  const re = new RegExp(`<meta[^>]*${attr}=["']${name}["'][^>]*>`, "i");
  const tag = html.match(re)?.[0];
  if (!tag) return null;
  const content = tag.match(/content=["']([^"']*)["']/i)?.[1];
  return content ? decode(content) : null;
}

async function loadHtml() {
  if (target) {
    const url = target.endsWith("/") ? target : `${target}/`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch ${url}: HTTP ${res.status}`);
    return await res.text();
  }
  return await readFile(new URL("../dist/index.html", import.meta.url), "utf8");
}

const html = await loadHtml();
const failures = [];

const title = decode(html.match(/<title>([^<]*)<\/title>/i)?.[1] ?? "");
if (!title) failures.push("Missing <title>");
else if (title !== EXPECTED_TITLE) failures.push(`<title> is "${title}", expected "${EXPECTED_TITLE}"`);

const description = metaContent(html, "name", "description");
if (!description) failures.push('Missing <meta name="description">');
else if (description !== EXPECTED_DESCRIPTION)
  failures.push(`meta description mismatch:\n  got:      ${description}\n  expected: ${EXPECTED_DESCRIPTION}`);

const checks = [
  ["og:title", EXPECTED_TITLE],
  ["og:description", EXPECTED_DESCRIPTION],
  ["og:url", EXPECTED_OG_URL],
];
for (const [prop, expected] of checks) {
  const value = metaContent(html, "property", prop);
  if (!value) failures.push(`Missing <meta property="${prop}">`);
  else if (value !== expected) failures.push(`${prop} is "${value}", expected "${expected}"`);
}

const ogImage = metaContent(html, "property", "og:image");
if (!ogImage) failures.push('Missing <meta property="og:image">');
else if (!/^https:\/\/gradr\.me\/.+\.(jpg|jpeg|png|webp)$/i.test(ogImage))
  failures.push(`og:image must be an absolute gradr.me image URL, got "${ogImage}"`);

const canonical = html.match(/<link[^>]*rel=["']canonical["'][^>]*>/i)?.[0];
if (!canonical) failures.push('Missing <link rel="canonical">');

if (failures.length) {
  console.error("SEO tag check FAILED:\n" + failures.map((f) => ` - ${f}`).join("\n"));
  process.exit(1);
}

console.log("SEO tag check passed: title, description, og:title, og:description, og:url, og:image, canonical.");
