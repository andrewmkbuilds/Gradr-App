#!/usr/bin/env node
/**
 * Quick DB health check.
 *
 * Probes the core credits, user_preferences, affiliate and job_matches queries
 * plus the main RPCs, and prints a pass/fail table.
 *
 *   node scripts/db-health-check.mjs
 *   node scripts/db-health-check.mjs --json
 *
 * Reads VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY from the environment
 * or from .env. Exits non-zero when any core object is missing.
 */
import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const JSON_OUT = process.argv.includes("--json");

function loadEnv() {
  const env = { ...process.env };
  for (const file of [".env.local", ".env"]) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
  return env;
}

const env = loadEnv();
const url = env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error("Missing VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY");
  process.exit(2);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

const MISSING_TABLE = ["42P01", "PGRST205"];
const MISSING_FUNCTION = ["42883", "PGRST202"];

const missing = (error, codes, pattern) =>
  !!error && (codes.includes(error.code) || pattern.test(error.message || ""));

/** Core product queries, mirroring how the app actually reads each table. */
const QUERIES = [
  { group: "credits", name: "usage_credits", run: () => supabase.from("usage_credits").select("user_id, application_credits, interview_credits").limit(1) },
  { group: "credits", name: "subscribers", run: () => supabase.from("subscribers").select("user_id, subscribed, subscription_tier").limit(1) },
  { group: "credits", name: "purchases", run: () => supabase.from("purchases").select("id, status").limit(1) },
  { group: "preferences", name: "user_preferences", run: () => supabase.from("user_preferences").select("user_id, digest_enabled, digest_send_time, digest_timezone").limit(1) },
  { group: "preferences", name: "profiles", run: () => supabase.from("profiles").select("user_id, display_name").limit(1) },
  { group: "preferences", name: "user_roles", run: () => supabase.from("user_roles").select("user_id, role").limit(1) },
  { group: "affiliate", name: "affiliate_profiles", run: () => supabase.from("affiliate_profiles").select("id, status").limit(1) },
  { group: "affiliate", name: "affiliate_commissions", run: () => supabase.from("affiliate_commissions").select("id, affiliate_profile_id, status").limit(1) },
  { group: "affiliate", name: "affiliate_payouts", run: () => supabase.from("affiliate_payouts").select("id, status").limit(1) },
  { group: "affiliate", name: "affiliate_tiers", run: () => supabase.from("affiliate_tiers").select("id, key, min_referrals, bonus_rate").limit(1) },
  { group: "affiliate", name: "affiliate_referrals", run: () => supabase.from("affiliate_referrals").select("id").limit(1) },
  { group: "jobs", name: "job_matches", run: () => supabase.from("job_matches").select("id, match_score").limit(1) },
  { group: "jobs", name: "tracked_jobs", run: () => supabase.from("tracked_jobs").select("id, status, applied_at").limit(1) },
  { group: "jobs", name: "job_reminders", run: () => supabase.from("job_reminders").select("id, due_at, done").limit(1) },
  { group: "jobs", name: "resumes", run: () => supabase.from("resumes").select("id, ats_score").limit(1) },
];

// Never a real user — only so overloaded RPCs resolve while probing.
const PROBE_UUID = "00000000-0000-0000-0000-000000000000";

const RPCS = [
  { name: "is_admin", args: {} },
  { name: "has_role", args: { _user_id: PROBE_UUID, _role: "admin" } },
  { name: "current_plan_tier", args: { _user_id: PROBE_UUID, _env: "live" } },
  { name: "entitlement_snapshot", args: {} },
  { name: "my_affiliate_overview", args: {} },
  { name: "affiliate_leaderboard", args: {} },
  { name: "get_affiliate_public_settings", args: {} },
  { name: "my_eligibility_state", args: {} },
  { name: "pending_legal_acceptances", args: {} },
];

const results = [];

for (const q of QUERIES) {
  const { error } = await q.run();
  const gone = missing(error, MISSING_TABLE, /does not exist|could not find the table/i);
  const colGone = !gone && !!error && /column .* does not exist/i.test(error.message || "");
  results.push({
    kind: "table",
    group: q.group,
    name: q.name,
    status: gone ? "MISSING" : colGone ? "SCHEMA_DRIFT" : error ? "BLOCKED" : "OK",
    detail: error?.message ?? null,
  });
}

for (const r of RPCS) {
  const { error } = await supabase.rpc(r.name, r.args);
  const gone = missing(error, MISSING_FUNCTION, /could not find the function|function .* does not exist/i);
  results.push({
    kind: "rpc",
    group: "rpc",
    name: r.name,
    status: gone ? "MISSING" : error ? "BLOCKED" : "OK",
    detail: error?.message ?? null,
  });
}

const bad = results.filter((r) => r.status === "MISSING" || r.status === "SCHEMA_DRIFT");

if (JSON_OUT) {
  console.log(JSON.stringify({ url, results, healthy: bad.length === 0 }, null, 2));
} else {
  const pad = Math.max(...results.map((r) => r.name.length)) + 2;
  let group = "";
  for (const r of results) {
    if (r.group !== group) {
      group = r.group;
      console.log(`\n${group.toUpperCase()}`);
    }
    const mark = r.status === "OK" ? "PASS" : r.status === "BLOCKED" ? "RLS " : "FAIL";
    console.log(`  ${mark}  ${r.name.padEnd(pad)}${r.status}${r.detail ? ` — ${r.detail}` : ""}`);
  }
  console.log(
    `\n${results.length - bad.length}/${results.length} objects reachable. ` +
      (bad.length ? `${bad.length} missing or drifted.` : "Database healthy."),
  );
  console.log("BLOCKED = object exists but is not readable anonymously (expected under RLS).");
}

process.exit(bad.length ? 1 : 0);
