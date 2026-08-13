#!/usr/bin/env node
/**
 * Captures a machine-comparable fingerprint snapshot of a deployed origin.
 *
 * The audit script (`fingerprint-audit.mjs`) answers "is anything wrong right
 * now?". This one answers "what changed?", which is the question a reviewer
 * actually has on a pull request. It records, per route:
 *
 *   - every `<head>` tag, normalised (tag name + sorted attributes)
 *   - the security/disclosure-relevant response headers
 *   - the parsed web app manifest, key-sorted
 *
 * Cache-busting tokens (`?v=…`) are normalised away so a routine OG re-render
 * doesn't drown the diff.
 *
 * Usage: node scripts/fingerprint-snapshot.mjs <origin> --out snapshot.json
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import process from "node:process";

const args = process.argv.slice(2);
const positional = args.filter((a) => !a.startsWith("--"));
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};

const BASE = (positional[0] ?? process.env.GRADR_ORIGIN ?? "https://gradr.me").replace(/\/$/, "");
const OUT = flag("out", "");

export const SNAPSHOT_ROUTES = [
  "/",
  "/auth",
  "/pricing",
  "/ai-interview-coach",
  "/ats-resume-checker",
  "/blog/ai-resume-optimization",
];

const TRACKED_HEADERS = [
  "content-security-policy",
  "content-security-policy-report-only",
  "reporting-endpoints",
  "strict-transport-security",
  "referrer-policy",
  "permissions-policy",
  "x-content-type-options",
  "x-frame-options",
  "cross-origin-opener-policy",
  "server",
  "x-powered-by",
  "x-generator",
  "x-runtime",
  "x-version",
];

/** `?v=abc123` on our own assets is artwork versioning, not a metadata change. */
const normalizeValue = (value) =>
  String(value)
    .replace(/([?&])v=[\w.%-]+/gi, "$1v=<token>")
    .replace(/\s+/g, " ")
    .trim();

function extractHeadTags(html) {
  const head = /<head[^>]*>([\s\S]*?)<\/head>/i.exec(html)?.[1] ?? "";
  const tags = [];
  const re = /<(meta|link|title|script)\b([^>]*)>([\s\S]*?)?(?:<\/\1>)?/gi;
  let match;
  while ((match = re.exec(head))) {
    const [, name, rawAttrs, inner] = match;
    const attrs = {};
    const attrRe = /([\w:-]+)\s*=\s*"([^"]*)"|([\w:-]+)\s*=\s*'([^']*)'/g;
    let a;
    while ((a = attrRe.exec(rawAttrs ?? ""))) {
      const key = (a[1] ?? a[3]).toLowerCase();
      attrs[key] = normalizeValue(a[2] ?? a[4] ?? "");
    }
    const label =
      name.toLowerCase() === "title"
        ? `title: ${normalizeValue(inner ?? "")}`
        : `${name.toLowerCase()}[${Object.entries(attrs)
            .sort(([x], [y]) => x.localeCompare(y))
            .map(([k, v]) => `${k}="${v}"`)
            .join(" ")}]`;
    // Inline scripts are captured by presence only — their bundle hash churns.
    tags.push(name.toLowerCase() === "script" && !attrs["src"] ? "script[inline]" : label);
  }
  return [...new Set(tags)].sort();
}

const sortKeys = (value) => {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, sortKeys(v)]),
    );
  }
  return typeof value === "string" ? normalizeValue(value) : value;
};

export async function captureSnapshot(base = BASE) {
  const snapshot = { origin: base, capturedAt: new Date().toISOString(), routes: {}, manifest: null };

  for (const route of SNAPSHOT_ROUTES) {
    try {
      const res = await fetch(`${base}${route}`, { redirect: "follow" });
      const html = await res.text();
      const headers = {};
      for (const name of TRACKED_HEADERS) {
        const value = res.headers.get(name);
        if (value) headers[name] = normalizeValue(value);
      }
      snapshot.routes[route] = { status: res.status, headers, head: extractHeadTags(html) };
    } catch (error) {
      snapshot.routes[route] = { error: error instanceof Error ? error.message : String(error) };
    }
  }

  try {
    const res = await fetch(`${base}/site.webmanifest`, { redirect: "follow" });
    snapshot.manifest = res.ok ? sortKeys(await res.json()) : { error: `HTTP ${res.status}` };
  } catch (error) {
    snapshot.manifest = { error: error instanceof Error ? error.message : String(error) };
  }

  return snapshot;
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const snapshot = await captureSnapshot(BASE);
  const serialized = `${JSON.stringify(snapshot, null, 2)}\n`;
  if (OUT) {
    mkdirSync(dirname(OUT), { recursive: true });
    writeFileSync(OUT, serialized);
    console.log(`Snapshot of ${BASE} written to ${OUT}`);
  } else {
    process.stdout.write(serialized);
  }
}
