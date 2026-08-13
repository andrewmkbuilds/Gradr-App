#!/usr/bin/env node
/**
 * Deployed OG image verifier.
 *
 * Fetches every social card the site advertises, hashes the bytes and compares
 * them with the Yacht Club artwork committed under public/. A mismatch means
 * the CDN (or a crawler cache) is still serving retired artwork; a missing
 * cache-buster means crawlers will never refetch it.
 *
 * Usage: node scripts/og-image-verify.mjs [baseUrl]
 */
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const spec = JSON.parse(readFileSync(path.join(ROOT, "src/config/brand-spec.json"), "utf8"));
const BASE = process.argv[2] || process.env.BRAND_BASE_URL || spec.brand.origin;

const sha = (buf) => createHash("sha256").update(buf).digest("hex");
const kb = (n) => `${Math.round(n / 1024)} KB`;

const cards = [...new Set(spec.routes.map((r) => r.ogImage))];
let failures = 0;
const seen = new Map();

console.log(`Verifying ${cards.length} social card(s) against ${BASE} (version ${spec.ogVersion})\n`);

for (const cardPath of cards) {
  const url = `${BASE}${cardPath}?v=${spec.ogVersion}`;
  const localFile = path.join(ROOT, "public", cardPath.replace(/^\//, ""));
  const problems = [];

  if (!existsSync(localFile)) {
    problems.push("no committed source artwork in public/ — card cannot be verified");
  }

  let body = null;
  let res = null;
  try {
    res = await fetch(url, { headers: { "user-agent": "GradrOgVerify/1.0" } });
    body = Buffer.from(await res.arrayBuffer());
  } catch (err) {
    problems.push(`fetch failed — ${err.message}`);
  }

  if (res && !res.ok) problems.push(`HTTP ${res.status}`);
  if (res && body) {
    const type = res.headers.get("content-type") || "";
    if (!type.startsWith("image/")) problems.push(`unexpected content-type ${type || "none"}`);
    if (body.length < 4096) problems.push(`suspiciously small response (${body.length} bytes)`);

    const deployedHash = sha(body);
    if (existsSync(localFile)) {
      const localHash = sha(readFileSync(localFile));
      if (deployedHash !== localHash) {
        problems.push(`STALE — deployed ${deployedHash.slice(0, 12)} != Yacht Club artwork ${localHash.slice(0, 12)}`);
      }
    }

    const dupe = seen.get(deployedHash);
    if (dupe) problems.push(`identical artwork to ${dupe} — card was never regenerated`);
    else seen.set(deployedHash, cardPath);

    // A hit that never revalidates keeps stale artwork alive in crawler caches.
    const cache = res.headers.get("cache-control") || "";
    if (/immutable/.test(cache) && !url.includes("?v=")) problems.push("immutable cache without a version key");

    if (!problems.length) {
      console.log(`ok   ${cardPath}  ${kb(body.length)}  ${deployedHash.slice(0, 12)}`);
      continue;
    }
  }

  failures++;
  console.error(`FAIL ${cardPath}\n      - ${problems.join("\n      - ")}`);
}

for (const legacy of spec.forbidden.ogFilenames) {
  const url = `${BASE}/og/${legacy}`;
  try {
    const res = await fetch(url, { method: "HEAD" });
    if (res.ok) {
      failures++;
      console.error(`FAIL ${url} — retired OG asset is still being served`);
    }
  } catch {
    /* unreachable retired asset is the desired state */
  }
}

console.log("");
if (failures) {
  console.error(`${failures} card check(s) failed.`);
  process.exit(1);
}
console.log("All deployed social cards match the current Yacht Club artwork.");
