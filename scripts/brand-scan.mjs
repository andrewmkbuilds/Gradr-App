#!/usr/bin/env node
/**
 * Build-time and deploy-time legacy-brand scan.
 *
 * Fails the build if any source that can reach a user — public HTML, route
 * metadata, public assets, the manifest, sitemap, robots, email templates or
 * the built output — still mentions the retired CareerFlow OS identity or an
 * old OG image filename.
 *
 * Usage:
 *   node scripts/brand-scan.mjs                 # scan repo sources + public/
 *   node scripts/brand-scan.mjs --dist          # additionally scan build output
 *   node scripts/brand-scan.mjs --url https://gradr.me   # deploy-time: scan live HTML
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const spec = JSON.parse(readFileSync(path.join(ROOT, "src/config/brand-spec.json"), "utf8"));

const NEEDLES = [...spec.forbidden.strings, ...spec.forbidden.ogFilenames];
const ALLOWLIST = spec.forbidden.allowlist;

const SCAN_DIRS = ["public", "src", "index.html"];
const DIST_DIRS = [".output", "dist"];
const TEXT_EXT = new Set([
  ".html", ".htm", ".json", ".webmanifest", ".xml", ".txt", ".ts", ".tsx",
  ".js", ".jsx", ".mjs", ".cjs", ".css", ".svg", ".md",
]);
const SKIP_DIRS = new Set(["node_modules", ".git", ".cache", "coverage", "test-results", "playwright-report"]);

const args = process.argv.slice(2);
const scanDist = args.includes("--dist");
const urlIndex = args.indexOf("--url");
const liveBase = urlIndex >= 0 ? args[urlIndex + 1] : null;

const failures = [];

const allowed = (rel) => ALLOWLIST.some((entry) => rel === entry || rel.startsWith(entry));

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) yield* walk(full);
    else yield full;
  }
}

function scanText(label, text) {
  const lower = text.toLowerCase();
  for (const needle of NEEDLES) {
    const at = lower.indexOf(needle.toLowerCase());
    if (at === -1) continue;
    const snippet = text.slice(Math.max(0, at - 40), at + needle.length + 40).replace(/\s+/g, " ");
    failures.push(`${label}: found "${needle}" — …${snippet}…`);
  }
}

function scanPath(target) {
  const abs = path.join(ROOT, target);
  if (!existsSync(abs)) return;
  const entries = statSync(abs).isDirectory() ? [...walk(abs)] : [abs];
  for (const file of entries) {
    const rel = path.relative(ROOT, file);
    if (allowed(rel)) continue;
    // Binary assets can still carry a legacy name in their *filename*.
    for (const legacy of spec.forbidden.ogFilenames) {
      if (path.basename(file).toLowerCase() === legacy.toLowerCase()) {
        failures.push(`${rel}: legacy OG asset filename still present`);
      }
    }
    if (!TEXT_EXT.has(path.extname(file).toLowerCase())) continue;
    scanText(rel, readFileSync(file, "utf8"));
  }
}

for (const dir of SCAN_DIRS) scanPath(dir);
if (scanDist) for (const dir of DIST_DIRS) scanPath(dir);

if (liveBase) {
  const targets = [...spec.routes.map((r) => r.path), spec.manifestPath, "/robots.txt", "/sitemap.xml", "/llms.txt"];
  for (const target of targets) {
    const url = new URL(target, liveBase).toString();
    try {
      const res = await fetch(url, { headers: { "user-agent": "GradrBrandScan/1.0" } });
      if (!res.ok) {
        failures.push(`${url}: HTTP ${res.status}`);
        continue;
      }
      scanText(url, await res.text());
      console.log(`scanned ${url}`);
    } catch (err) {
      failures.push(`${url}: fetch failed — ${err.message}`);
    }
  }
}

if (failures.length) {
  console.error("\nLegacy branding detected — build blocked:\n");
  for (const f of failures) console.error(`  ✗ ${f}`);
  console.error(`\n${failures.length} violation(s). Update the asset/copy, or add a justified path to`);
  console.error("src/config/brand-spec.json → forbidden.allowlist.\n");
  process.exit(1);
}

console.log(`Brand scan clean — no legacy identity in ${SCAN_DIRS.join(", ")}${scanDist ? " + build output" : ""}${liveBase ? ` + ${liveBase}` : ""}.`);
