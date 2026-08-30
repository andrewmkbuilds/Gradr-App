/**
 * Single source of truth for the database objects the app depends on.
 * Used by the schema integration test and by `scripts/db-health-check.mjs`.
 */

/** Tables exercised by the core product surfaces. */
export const CORE_TABLES = [
  // credits & billing
  "usage_credits",
  "subscribers",
  "purchases",
  // preferences & profile
  "profiles",
  "user_preferences",
  "user_roles",
  // jobs
  "tracked_jobs",
  "job_matches",
  "job_reminders",
  "discovered_jobs",
  "resumes",
  // affiliate
  "affiliate_profiles",
  "affiliate_commissions",
  "affiliate_payouts",
  "affiliate_tiers",
  "affiliate_referrals",
  "affiliate_clicks",
] as const;

/** Secondary tables — missing ones degrade features but not the core flows. */
export const SUPPORTING_TABLES = [
  "analytics_events",
  "notifications",
  "interview_sessions",
  "scheduled_interviews",
  "legal_documents",
  "legal_acceptances",
  "discount_rules",
  "discount_settings",
  "eligibility_verifications",
  "verification_requests",
  "user_integrations",
  "digest_send_logs",
] as const;

/** Never a real user — only used so overloaded RPCs resolve during probing. */
const PROBE_UUID = "00000000-0000-0000-0000-000000000000";

/**
 * RPCs the app calls. `args` are safe probe arguments — the probe only asserts
 * that the function exists, not that the call succeeds under RLS.
 */
export const CORE_RPCS: { name: string; args: Record<string, unknown> }[] = [
  { name: "is_admin", args: {} },
  // Both take an explicit subject; PostgREST resolves overloads by argument
  // name, so the probe must pass every non-defaulted parameter.
  { name: "has_role", args: { _user_id: PROBE_UUID, _role: "admin" } },
  { name: "current_plan_tier", args: { _user_id: PROBE_UUID, _env: "live" } },
  { name: "entitlement_snapshot", args: {} },
  { name: "my_affiliate_overview", args: {} },
  { name: "affiliate_leaderboard", args: {} },
  { name: "get_affiliate_public_settings", args: {} },
  { name: "my_eligibility_state", args: {} },
  { name: "pending_legal_acceptances", args: {} },
  { name: "log_user_preferences_read", args: { _surface: "healthcheck", _found: true } },
];

/** Storage buckets the app reads from or writes to. */
export const REQUIRED_BUCKETS = [
  "resumes",
  "cover-letters",
  "generated-pdfs",
  "profile-images",
  "portfolio-assets",
  "company-logos",
] as const;

/** Postgres/PostgREST codes that mean "this object does not exist". */
export const MISSING_TABLE_CODES = ["42P01", "PGRST205"];
export const MISSING_FUNCTION_CODES = ["42883", "PGRST202"];

export function isMissingTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code && MISSING_TABLE_CODES.includes(error.code)) return true;
  return /does not exist|could not find the table/i.test(error.message ?? "");
}

export function isMissingFunction(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code && MISSING_FUNCTION_CODES.includes(error.code)) return true;
  return /could not find the function|function .* does not exist/i.test(error.message ?? "");
}
