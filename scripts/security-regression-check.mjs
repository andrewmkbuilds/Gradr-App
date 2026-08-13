#!/usr/bin/env node
/**
 * CI gate: fail the build if any *resolved* security finding reappears in the
 * most recent recorded scan run.
 *
 * The watched IDs live in `supabase/security/baseline.json -> resolvedFindings`.
 * Scan runs are written to `public.security_scan_runs` by the admin panel and
 * by the deploy pipeline, each stamped with the commit that was live.
 *
 * Usage: DATABASE_URL=postgres://... node scripts/security-regression-check.mjs
 */
import { query, loadBaseline, dbConfigured } from "./securityBaseline.mjs";

const baseline = loadBaseline();
const watched = baseline.resolvedFindings ?? [];

if (!watched.length) {
  console.error("No resolvedFindings configured in supabase/security/baseline.json.");
  process.exit(2);
}

if (!dbConfigured()) {
  console.error("No database connection configured. Set DATABASE_URL or PG* env vars.");
  process.exit(2);
}

let rows;
try {
  rows = query(
    `select coalesce(array_to_string(internal_ids, ','), ''), scanned_at, coalesce(commit_sha, '')
       from public.security_scan_runs order by scanned_at desc limit 1`,
  );
} catch (e) {
  console.error("Could not read security_scan_runs:", e instanceof Error ? e.message : e);
  process.exit(2);
}

if (!rows.length) {
  console.log("No scan runs recorded yet — nothing to regress against.");
  process.exit(0);
}

const [idsRaw, scannedAt, commit] = rows[0];
const present = new Set(idsRaw.split(",").map((s) => s.trim()).filter(Boolean));
const regressed = watched.filter((id) => present.has(id));

console.log(`Latest scan ${scannedAt}${commit ? ` @ ${commit.slice(0, 7)}` : ""}`);
for (const id of watched) {
  console.log(`${regressed.includes(id) ? "FAIL" : "ok  "}  ${id}`);
}

if (regressed.length) {
  console.log(
    `\n${regressed.length} previously resolved finding(s) reappeared. Restore the fix before merging.`,
  );
  process.exit(1);
}

console.log("\nNo resolved security findings have regressed.");
