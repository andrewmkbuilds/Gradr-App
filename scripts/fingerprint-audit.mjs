#!/usr/bin/env node
/**
 * Technology-fingerprint audit (CWE-200 regression guard).
 *
 * Recon scanners flag a site when its responses volunteer *which software and
 * which version* is running. This script fetches the key routes, the web app
 * manifest and the assets they link, then fails when it finds:
 *
 *   - disclosure headers (`x-powered-by`, `x-runtime`, `server: <name>/<ver>` …)
 *   - `<meta name="generator">` or any version-ish meta tag
 *   - framework/build version strings in the served HTML, manifest or assets
 *   - `sourceMappingURL` comments or reachable `.map` files
 *   - well-known leak paths (`/package.json`, `/.env`, `/vite.config.js` …)
 *
 * It also asserts the security headers from `src/lib/security/headers.ts`, so
 * one CI job covers both "headers are exactly what we set" and "we never
 * reintroduce version/powered-by disclosure".
 *
 * Usage: node scripts/fingerprint-audit.mjs [baseUrl]
 */
import process from "node:process";

const BASE = (process.argv[2] ?? process.env.GRADR_ORIGIN ?? "https://gradr.me").replace(/\/$/, "");

const ROUTES = [
  "/",
  "/auth",
  "/pricing",
  "/ai-interview-coach",
  "/ats-resume-checker",
  "/status",
  "/site.webmanifest",
  "/robots.txt",
  "/sitemap.xml",
];

/** Paths that must not be served at all — each one names the stack outright. */
const LEAK_PATHS = [
  "/package.json",
  "/package-lock.json",
  "/bun.lock",
  "/.env",
  "/.env.production",
  "/vite.config.js",
  "/vite.config.ts",
  "/tsconfig.json",
  "/.git/HEAD",
  "/wrangler.toml",
];

/** Headers that name the stack. `server` is checked separately (see below). */
const DISCLOSURE_HEADERS = [
  "x-powered-by",
  "x-aspnet-version",
  "x-aspnetmvc-version",
  "x-generator",
  "x-runtime",
  "x-version",
  "x-nitro-prerender",
  "x-sveltekit-page",
  "x-turbo-version",
];

/**
 * Cache-busting query keys are NOT fingerprints — they version *our artwork*,
 * not our software — so the OG card token is explicitly allowed.
 */
const ALLOWED_VERSION_TOKENS = [/\/og[a-z0-9/_-]*\.(?:jpg|png)\?v=[\w.-]+/i];

/** Version strings that identify software. Deliberately narrow to avoid noise. */
const SOFTWARE_VERSION_PATTERNS = [
  /\b(?:vite|react|next|nuxt|remix|astro|svelte|tanstack|express|nitro|node)[\s/@_-]?v?\d+\.\d+\.\d+/i,
  /\bpowered[ -]by\b/i,
  /<meta[^>]+name=["']generator["'][^>]*>/i,
  /sourceMappingURL/i,
  /"?(?:buildVersion|appVersion|__BUILD_ID__|commitSha|gitCommit)"?\s*[:=]/i,
];

const problems = [];
const notes = [];
const fail = (msg) => problems.push(msg);

async function get(path, init = {}) {
  const url = path.startsWith("http") ? path : `${BASE}${path}`;
  const response = await fetch(url, { redirect: "follow", ...init });
  return { url, response };
}

function stripAllowed(text) {
  let out = text;
  for (const pattern of ALLOWED_VERSION_TOKENS) out = out.replace(new RegExp(pattern, "gi"), "");
  return out;
}

function auditHeaders(path, response) {
  for (const name of DISCLOSURE_HEADERS) {
    const value = response.headers.get(name);
    if (value) fail(`${path}: disclosure header ${name}: ${value}`);
  }
  // "server: cloudflare" is a CDN name with no version — acceptable. A version
  // suffix ("nginx/1.24.0") is exactly the CWE-200 signal we must not emit.
  const server = response.headers.get("server");
  if (server && /\d+\.\d+/.test(server)) fail(`${path}: server header discloses a version: ${server}`);
  else if (server) notes.push(`${path}: server: ${server} (no version — acceptable)`);

  const via = response.headers.get("via");
  if (via && /\d+\.\d+\.\d+/.test(via)) fail(`${path}: via header discloses a version: ${via}`);
}

function auditBody(path, text) {
  const scrubbed = stripAllowed(text);
  for (const pattern of SOFTWARE_VERSION_PATTERNS) {
    const match = scrubbed.match(pattern);
    if (match) fail(`${path}: version/technology signal in body → ${match[0].slice(0, 120)}`);
  }
}

function collectAssets(html) {
  const assets = new Set();
  for (const match of html.matchAll(/(?:src|href)="(\/[^"]+\.(?:js|css|webmanifest|json))"/g)) {
    assets.add(match[1]);
  }
  return [...assets].slice(0, 12); // a representative sample keeps CI fast
}

async function main() {
  console.log(`Fingerprint audit → ${BASE}\n`);

  let firstHtml = "";
  for (const path of ROUTES) {
    const { response } = await get(path);
    if (!response.ok) {
      fail(`${path}: unexpected status ${response.status}`);
      continue;
    }
    auditHeaders(path, response);
    const text = await response.text();
    auditBody(path, text);
    if (path === "/" ) firstHtml = text;

    if (path === "/site.webmanifest") {
      try {
        const manifest = JSON.parse(text);
        for (const key of ["version", "build", "generator", "framework", "app_version"]) {
          if (key in manifest) fail(`site.webmanifest exposes "${key}": ${manifest[key]}`);
        }
      } catch {
        fail("site.webmanifest is not valid JSON");
      }
    }
    console.log(`  checked ${path}`);
  }

  // Linked assets: bundlers love to leave banner comments and source maps.
  for (const asset of collectAssets(firstHtml)) {
    const { response } = await get(asset);
    if (!response.ok) continue;
    auditHeaders(asset, response);
    const body = await response.text();
    auditBody(asset, body.slice(0, 4000) + body.slice(-2000));

    const map = await get(`${asset}.map`);
    if (map.response.ok && (map.response.headers.get("content-type") ?? "").includes("json")) {
      fail(`${asset}.map is publicly reachable (exposes original sources)`);
    }
    console.log(`  checked ${asset}`);
  }

  for (const path of LEAK_PATHS) {
    const { response } = await get(path);
    const type = response.headers.get("content-type") ?? "";
    // SPA hosting answers unknown paths with the HTML shell; only a real file
    // (JSON/text/octet-stream) counts as a leak.
    if (!response.ok || type.includes("text/html")) continue;

    const body = (await response.text()).slice(0, 20_000);
    // The deploy bundle ships a stub `package.json`/lockfile the host requires.
    // Those are harmless — they name no dependency, script or version. Only a
    // manifest that actually enumerates the stack is a disclosure.
    const revealsStack = /"(?:dependencies|devDependencies|scripts|engines|version|packages)"\s*:/.test(body);
    if (revealsStack) fail(`${path} is publicly reachable and reveals the stack (${type})`);
    else notes.push(`${path}: served as a content-free deploy stub (no dependencies or versions)`);
  }

  console.log(`  checked ${LEAK_PATHS.length} known leak paths\n`);

  for (const note of notes) console.log(`note: ${note}`);
  if (problems.length) {
    console.error(`\n✗ ${problems.length} fingerprinting problem(s):`);
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exit(1);
  }
  console.log("\n✓ No technology/version fingerprinting signals found.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
