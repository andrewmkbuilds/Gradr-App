#!/usr/bin/env node
/**
 * Detects drift between the database schema and the committed
 * `src/integrations/supabase/types.ts`.
 *
 * Two modes, picked automatically:
 *
 *  1. AUTHORITATIVE — when `SUPABASE_ACCESS_TOKEN` (and a project ref) are
 *     available, regenerate the types with the Supabase CLI and diff them
 *     against the committed file. Any difference is drift.
 *
 *  2. HEURISTIC — otherwise (normal PR CI, local dev), compare migration
 *     timestamps against the types file: if a migration lands that is newer
 *     than the last time types were regenerated, or a migration creates a
 *     public table that is absent from types.ts, the check fails.
 *
 * Fix with:  bun run types:generate
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const TYPES = path.join(ROOT, "src/integrations/supabase/types.ts");
const MIGRATIONS = path.join(ROOT, "supabase/migrations");
const STAMP = path.join(ROOT, "supabase/.types-generated-at");

const fail = (msg) => {
  console.error(`\n✖ Schema/type drift: ${msg}\n  Run: bun run types:generate\n`);
  process.exit(1);
};

if (!existsSync(TYPES)) fail("src/integrations/supabase/types.ts is missing");
const typesSource = readFileSync(TYPES, "utf8");

const projectRef =
  process.env.SUPABASE_PROJECT_ID ||
  process.env.VITE_SUPABASE_PROJECT_ID ||
  readEnvFile("VITE_SUPABASE_PROJECT_ID");

function readEnvFile(key) {
  const envPath = path.join(ROOT, ".env");
  if (!existsSync(envPath)) return undefined;
  const line = readFileSync(envPath, "utf8").split("\n").find((l) => l.startsWith(`${key}=`));
  return line?.slice(key.length + 1).trim();
}

// ---------------------------------------------------------------- mode 1
if (process.env.SUPABASE_ACCESS_TOKEN && projectRef) {
  let generated;
  try {
    generated = execFileSync(
      "npx",
      ["-y", "supabase@latest", "gen", "types", "typescript", "--project-id", projectRef],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 32 * 1024 * 1024 },
    );
  } catch (err) {
    console.warn(`⚠ Could not reach Supabase to generate types (${err.message.split("\n")[0]}).`);
    console.warn("  Falling back to the heuristic migration check.");
  }
  if (generated) {
    const norm = (s) => s.replace(/\r\n/g, "\n").trim();
    if (norm(generated) !== norm(typesSource)) {
      fail("generated types differ from the committed src/integrations/supabase/types.ts");
    }
    console.log("✓ types.ts matches the live database schema");
    process.exit(0);
  }
}

// ---------------------------------------------------------------- mode 2
if (!existsSync(MIGRATIONS)) {
  console.log("✓ no migrations directory — nothing to compare");
  process.exit(0);
}

const migrations = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();
if (migrations.length === 0) {
  console.log("✓ no migrations — nothing to compare");
  process.exit(0);
}

// Every public table created by a migration must be present in types.ts.
const missing = new Set();
for (const file of migrations) {
  const sql = readFileSync(path.join(MIGRATIONS, file), "utf8");
  for (const m of sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?public\.("?)([a-z0-9_]+)\1/gi)) {
    const table = m[2];
    if (sql.match(new RegExp(`drop\\s+table[^;]*public\\.${table}\\b`, "i"))) continue;
    if (!new RegExp(`\\b${table}\\s*:\\s*\\{`).test(typesSource)) missing.add(table);
  }
}
if (missing.size > 0) {
  fail(`table(s) present in migrations but absent from types.ts: ${[...missing].join(", ")}`);
}

// Freshness: types must have been regenerated after the newest migration.
const newest = migrations[migrations.length - 1];
const newestMtime = statSync(path.join(MIGRATIONS, newest)).mtimeMs;
const stampMtime = existsSync(STAMP)
  ? Number(readFileSync(STAMP, "utf8").trim()) || statSync(STAMP).mtimeMs
  : statSync(TYPES).mtimeMs;

if (stampMtime + 60_000 < newestMtime) {
  fail(`migration "${newest}" is newer than the last types generation`);
}

console.log(`✓ types.ts covers all ${migrations.length} migrations (heuristic check)`);
