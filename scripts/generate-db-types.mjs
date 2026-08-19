#!/usr/bin/env node
/**
 * Regenerates `src/integrations/supabase/types.ts` from the linked database
 * and records when it happened, so `check-type-drift.mjs` can tell whether a
 * later migration has invalidated the committed types.
 *
 * Requires SUPABASE_ACCESS_TOKEN and a project ref (env or .env).
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const TYPES = path.join(ROOT, "src/integrations/supabase/types.ts");
const STAMP = path.join(ROOT, "supabase/.types-generated-at");

function fromEnvFile(key) {
  const envPath = path.join(ROOT, ".env");
  if (!existsSync(envPath)) return undefined;
  return readFileSync(envPath, "utf8")
    .split("\n")
    .find((l) => l.startsWith(`${key}=`))
    ?.slice(key.length + 1)
    .trim();
}

const projectRef =
  process.env.SUPABASE_PROJECT_ID ||
  process.env.VITE_SUPABASE_PROJECT_ID ||
  fromEnvFile("VITE_SUPABASE_PROJECT_ID");

if (!projectRef) {
  console.error("✖ No project ref found (SUPABASE_PROJECT_ID or VITE_SUPABASE_PROJECT_ID).");
  process.exit(1);
}
if (!process.env.SUPABASE_ACCESS_TOKEN) {
  console.error("✖ SUPABASE_ACCESS_TOKEN is required to generate types.");
  process.exit(1);
}

const generated = execFileSync(
  "npx",
  ["-y", "supabase@latest", "gen", "types", "typescript", "--project-id", projectRef],
  { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
);

writeFileSync(TYPES, generated);
writeFileSync(STAMP, `${Date.now()}\n`);
console.log(`✓ Regenerated ${path.relative(ROOT, TYPES)} for ${projectRef}`);
