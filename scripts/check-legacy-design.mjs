#!/usr/bin/env node
/**
 * Legacy design-system scanner.
 *
 * Fails the build when pre-Yacht-Club remnants creep back into the codebase:
 * hardcoded colors that bypass the semantic tokens, the retired `glass-card`
 * treatment, and the old "AI template" indigo/violet palette.
 *
 * Usage: node scripts/check-legacy-design.mjs
 */
import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative } from "path";

const ROOT = process.cwd();
const SRC = join(ROOT, "src");

// Files that legitimately define raw colors (tokens, generators, email HTML).
const ALLOWLIST = [
  "src/index.css",
  "src/lib/design/yachtClub.ts",
  "src/config/brandAssets.generated.ts",
];

const RULES = [
  {
    id: "hardcoded-tailwind-color",
    pattern: /\b(?:bg|text|border|ring|fill|stroke)-(?:white|black|slate|gray|zinc|neutral|stone|indigo|violet|purple|fuchsia)-(?:\d{2,3})\b/g,
    message: "Use semantic tokens (bg-background, text-foreground, border-border …) instead of raw palette colors.",
  },
  {
    id: "bare-white-black",
    pattern: /className="[^"]*\b(?:bg-white|bg-black|text-white|text-black)\b/g,
    message: "bg-white / text-white bypass theming — use surface and foreground tokens.",
  },
  {
    id: "arbitrary-hex",
    pattern: /(?:bg|text|border|from|via|to)-\[#[0-9a-fA-F]{3,8}\]/g,
    message: "Arbitrary hex utility found — add the value to the design tokens instead.",
  },
  {
    id: "glass-card",
    pattern: /\bglass-card\b/g,
    message: "`glass-card` was retired — use <Surface level={1..4}> / elev-* tokens.",
  },
  {
    id: "legacy-brand-name",
    pattern: /CareerFlow\s?OS/gi,
    message: "Legacy product name — the product is Gradr.",
  },
];

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, files);
    else if (/\.(tsx?|css)$/.test(full)) files.push(full);
  }
  return files;
}

const violations = [];
for (const file of walk(SRC)) {
  const rel = relative(ROOT, file);
  if (ALLOWLIST.includes(rel)) continue;
  const source = readFileSync(file, "utf8");
  const lines = source.split("\n");
  for (const rule of RULES) {
    lines.forEach((line, index) => {
      if (line.includes("legacy-design-ok")) return;
      const matches = line.match(rule.pattern);
      if (!matches) return;
      violations.push({ rel, line: index + 1, rule, snippet: matches[0] });
    });
  }
}

if (violations.length) {
  console.error(`\n✖ ${violations.length} legacy design-system remnant(s) found:\n`);
  const byRule = new Map();
  for (const v of violations) {
    if (!byRule.has(v.rule.id)) byRule.set(v.rule.id, []);
    byRule.get(v.rule.id).push(v);
  }
  for (const [id, list] of byRule) {
    console.error(`  ${id} — ${list[0].rule.message}`);
    for (const v of list.slice(0, 25)) {
      console.error(`    ${v.rel}:${v.line}  ${v.snippet}`);
    }
    if (list.length > 25) console.error(`    … and ${list.length - 25} more`);
    console.error("");
  }
  console.error("Add `legacy-design-ok` to a line only when the raw value is intentional.\n");
  process.exit(1);
}

console.log("✓ No legacy design-system remnants found.");
