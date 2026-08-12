#!/usr/bin/env node
/**
 * CI gate: fail the build when database policies, grants, audit triggers or
 * SECURITY DEFINER execute privileges drift from `supabase/security/baseline.json`.
 *
 * Usage: DATABASE_URL=postgres://... node scripts/security-baseline.mjs
 */
import { runBaselineChecks, dbConfigured } from "./securityBaseline.mjs";

if (!dbConfigured()) {
  console.error("No database connection configured. Set DATABASE_URL or PG* env vars.");
  process.exit(2);
}

let results;
try {
  results = runBaselineChecks();
} catch (e) {
  console.error("Baseline check could not run:", e instanceof Error ? e.message : e);
  process.exit(2);
}

const failures = results.filter((r) => !r.ok);
for (const r of results) {
  if (!r.ok) console.log(`FAIL  ${r.name}${r.detail ? ` — ${r.detail}` : ""}`);
}
console.log(`\n${results.length - failures.length}/${results.length} security baseline checks passed.`);

if (failures.length) {
  console.log(
    "\nIf a change was intentional, update supabase/security/baseline.json in the same pull request.",
  );
  process.exit(1);
}
