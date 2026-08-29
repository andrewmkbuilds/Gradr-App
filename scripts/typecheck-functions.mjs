#!/usr/bin/env node
/**
 * Typechecks the Supabase edge functions with Deno and fails on the error
 * codes that indicate a genuine bug.
 *
 * Why a filtered gate instead of a plain `deno check`:
 * the functions call Supabase with an untyped client, so every `.from(...)`
 * result widens to `never` and a clean run is impossible today (~120 errors,
 * all of that shape). Gating on everything would mean gating on nothing.
 *
 * The codes below cannot be produced by the untyped-client noise — they mean a
 * name does not exist or a call is malformed. This gate exists because a
 * `ReferenceError: data is not defined` shipped to production in the payments
 * webhook and took every Paddle delivery down: the Vitest contract tests only
 * exercised the pure helpers, never the module, so nothing caught it.
 *
 * As the `never` noise gets fixed, move codes from ALLOWED_NOISE into BLOCKING.
 */
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";

/** Errors that always mean a real defect. */
const BLOCKING = new Set([
  "TS2304", // Cannot find name 'x'        <- the payments-webhook outage
  "TS2551", // Property does not exist, did you mean...
  "TS2552", // Cannot find name, did you mean...
  "TS2554", // Expected N arguments, but got M
  "TS2555", // Expected at least N arguments
  "TS2724", // No exported member named 'x'
  "TS2305", // Module has no exported member 'x'
]);

const FUNCTIONS_DIR = "supabase/functions";
const CONFIG = join(FUNCTIONS_DIR, "deno.check.json");

const entrypoints = readdirSync(FUNCTIONS_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && !entry.name.startsWith("_"))
  .map((entry) => join(FUNCTIONS_DIR, entry.name, "index.ts"));

if (entrypoints.length === 0) {
  console.error("No edge function entrypoints found under", FUNCTIONS_DIR);
  process.exit(1);
}

const result = spawnSync("deno", ["check", "--config", CONFIG, ...entrypoints], {
  encoding: "utf8",
  maxBuffer: 32 * 1024 * 1024,
});

if (result.error) {
  console.error("Could not run `deno check`:", result.error.message);
  process.exit(1);
}

// Deno colourises even when piped; strip so the codes match.
const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.replace(
  // eslint-disable-next-line no-control-regex
  /\u001b\[[0-9;]*m/g,
  "",
);

const lines = output.split("\n");
const failures = [];

for (let i = 0; i < lines.length; i += 1) {
  const match = /^(TS\d+) \[ERROR\]: (.*)$/.exec(lines[i].trim());
  if (!match || !BLOCKING.has(match[1])) continue;

  // The source location follows a few lines below, as `    at file:///...`.
  const location = lines
    .slice(i + 1, i + 6)
    .find((line) => line.trim().startsWith("at file:"))
    ?.trim()
    .replace(/^at /, "") ?? "unknown location";

  failures.push(`${match[1]}: ${match[2]}\n    ${location}`);
}

if (failures.length > 0) {
  console.error(`\nEdge function typecheck failed with ${failures.length} blocking error(s):\n`);
  for (const failure of failures) console.error(`  ${failure}\n`);
  console.error("These codes mean a name or call does not resolve — fix them, do not suppress.");
  process.exit(1);
}

console.log(`Edge function typecheck OK — ${entrypoints.length} functions, no blocking errors.`);
