#!/usr/bin/env node
/**
 * CI gate: fail the build if a previously fixed security finding reappears.
 *
 * Each guard in `supabase/security/baseline.json -> findingGuards` maps to a
 * scanner `internal_id`. The guards currently enforced are:
 *   - SUPA_auth_allow_anonymous_sign_ins
 *   - SUPA_anon_security_definer_function_executable
 *   - SUPA_authenticated_security_definer_function_executable
 *
 * Usage: DATABASE_URL=postgres://... node scripts/security-findings-guard.mjs
 */
import { runBaselineChecks, loadBaseline, dbConfigured } from "./securityBaseline.mjs";

const baseline = loadBaseline();
const guards = baseline.findingGuards ?? [];

if (!guards.length) {
  console.error("No findingGuards configured in supabase/security/baseline.json.");
  process.exit(2);
}

if (!dbConfigured()) {
  console.error("No database connection configured. Set DATABASE_URL or PG* env vars.");
  process.exit(2);
}

let results;
try {
  results = runBaselineChecks(baseline);
} catch (e) {
  console.error("Finding guards could not run:", e instanceof Error ? e.message : e);
  process.exit(2);
}

let failed = 0;
for (const guard of guards) {
  const scoped = results.filter((r) => r.name.startsWith(`finding guard [${guard.internalId}]`));
  const bad = scoped.filter((r) => !r.ok);
  failed += bad.length;
  console.log(
    `${bad.length ? "FAIL" : "ok  "}  ${guard.internalId} — ${scoped.length - bad.length}/${scoped.length} checks passed`,
  );
  for (const r of bad) console.log(`      ${r.name}${r.detail ? ` — ${r.detail}` : ""}`);
}

if (failed) {
  console.log(
    "\nA previously resolved security finding has regressed. Restore the protection " +
      "(policies, predicates or EXECUTE grants) before merging.",
  );
  process.exit(1);
}

console.log("\nAll security finding guards passed.");
