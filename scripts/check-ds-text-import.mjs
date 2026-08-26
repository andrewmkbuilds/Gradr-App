#!/usr/bin/env node
/**
 * Guard: JSX `<Text>` must be the design-system component, never DOM `Text`.
 *
 * TypeScript resolves a missing import of `Text` to the global DOM `Text`
 * constructor instead of erroring on an unknown name, which produced a
 * confusing TS2607/TS2786 build failure once already. This check scans every
 * TSX file that renders `<Text ...>` and requires a matching import (from the
 * design system, or a local definition/alias in the same file).
 *
 * Usage: node scripts/check-ds-text-import.mjs
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOTS = ["src"];
const SKIP = new Set(["node_modules", "dist", "design-system"]);

/** Recursively collect .tsx files, skipping vendored design-system source. */
function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry)) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (entry.endsWith(".tsx")) out.push(full);
  }
  return out;
}

const USES_TEXT = /<Text[\s/>]/;
const DEFINES_TEXT =
  /import\s+\{[^}]*\bText\b[^}]*\}\s+from|import\s+Text\s+from|\bconst\s+Text\b|\bfunction\s+Text\b|\bas\s+Text\b/;

const offenders = [];
for (const root of ROOTS) {
  for (const file of walk(root)) {
    const src = readFileSync(file, "utf8");
    if (!USES_TEXT.test(src)) continue;
    if (DEFINES_TEXT.test(src)) continue;
    const line = src.split("\n").findIndex((l) => USES_TEXT.test(l)) + 1;
    offenders.push(`${file}:${line}`);
  }
}

if (offenders.length > 0) {
  console.error("FAIL  <Text> rendered without importing the design-system Text component:");
  for (const o of offenders) console.error(`  ${o}`);
  console.error('\nFix: import { Text } from "@/design-system/gradr-9b9b95";');
  process.exit(1);
}

console.log("PASS  every <Text> usage imports the design-system Text component.");
