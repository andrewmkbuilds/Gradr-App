#!/usr/bin/env node
/**
 * Diffs two fingerprint snapshots and prints exactly what changed in the head
 * tags, tracked response headers and the web app manifest.
 *
 * In CI this runs as "this branch vs main", so a reviewer sees a short list of
 * added/removed/changed metadata lines instead of re-reading a whole audit log.
 *
 * Usage:
 *   node scripts/fingerprint-diff.mjs base.json head.json [--markdown] [--fail-on-change]
 */
import { readFileSync } from "node:fs";
import process from "node:process";

const args = process.argv.slice(2);
const files = args.filter((a) => !a.startsWith("--"));
const markdown = args.includes("--markdown");
const failOnChange = args.includes("--fail-on-change");

if (files.length < 2) {
  console.error("Usage: fingerprint-diff.mjs <base.json> <head.json> [--markdown] [--fail-on-change]");
  process.exit(2);
}

const read = (path) => JSON.parse(readFileSync(path, "utf8"));
const base = read(files[0]);
const head = read(files[1]);

const changes = [];
const record = (section, kind, detail) => changes.push({ section, kind, detail });

const diffLists = (section, before = [], after = []) => {
  const b = new Set(before);
  const a = new Set(after);
  for (const item of after) if (!b.has(item)) record(section, "added", item);
  for (const item of before) if (!a.has(item)) record(section, "removed", item);
};

const diffMaps = (section, before = {}, after = {}) => {
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const b = before[key];
    const a = after[key];
    if (JSON.stringify(b) === JSON.stringify(a)) continue;
    if (b === undefined) record(section, "added", `${key}: ${JSON.stringify(a)}`);
    else if (a === undefined) record(section, "removed", `${key}: ${JSON.stringify(b)}`);
    else record(section, "changed", `${key}: ${JSON.stringify(b)} → ${JSON.stringify(a)}`);
  }
};

const routes = new Set([...Object.keys(base.routes ?? {}), ...Object.keys(head.routes ?? {})]);
for (const route of [...routes].sort()) {
  const b = base.routes?.[route] ?? {};
  const a = head.routes?.[route] ?? {};
  if (b.status !== a.status) record(route, "changed", `status: ${b.status ?? "n/a"} → ${a.status ?? "n/a"}`);
  diffLists(`${route} · head`, b.head, a.head);
  diffMaps(`${route} · headers`, b.headers, a.headers);
}

diffMaps("webmanifest", base.manifest ?? {}, head.manifest ?? {});

const icon = { added: "＋", removed: "－", changed: "~" };

if (markdown) {
  const lines = [
    "## Fingerprint metadata diff",
    "",
    `\`${base.origin}\` (base) → \`${head.origin}\` (head)`,
    "",
  ];
  if (changes.length === 0) {
    lines.push("No head-tag, security-header or webmanifest changes detected.");
  } else {
    lines.push(`**${changes.length} change${changes.length === 1 ? "" : "s"}**`, "", "| Where | Change | Detail |", "| --- | --- | --- |");
    for (const c of changes) {
      lines.push(`| \`${c.section}\` | ${c.kind} | \`${c.detail.replace(/\|/g, "\\|").slice(0, 300)}\` |`);
    }
  }
  process.stdout.write(`${lines.join("\n")}\n`);
} else if (changes.length === 0) {
  console.log("No fingerprint metadata changes detected.");
} else {
  console.log(`${changes.length} fingerprint metadata change(s):\n`);
  for (const c of changes) console.log(`${icon[c.kind]} [${c.section}] ${c.detail}`);
}

process.exit(failOnChange && changes.length > 0 ? 1 : 0);
