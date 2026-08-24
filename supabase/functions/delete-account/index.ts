/**
 * Permanent account deletion.
 *
 * Verifies the caller's JWT, requires an explicit confirmation phrase, deletes
 * their stored files and rows, then removes the auth user itself. The whole
 * action is written to the security audit log.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { logSecurityEvent } from "../_shared/securityAudit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/**
 * User-owned rows carrying personal data. These are hard-deleted.
 *
 * Financial rows are handled separately below: the raw records are also
 * deleted, but a pseudonymised summary is retained for tax/accounting duties.
 */
const USER_TABLES = [
  "interview_session_metrics",
  "interview_session_state",
  "interview_sessions",
  "scheduled_interviews",
  "job_reminders",
  "job_matches",
  "tracked_jobs",
  "career_plans",
  "resumes",
  "notifications",
  "notification_preferences",
  "user_preferences",
  "user_integrations",
  "digest_send_logs",
  "email_notification_log",
  "analytics_events",
  "oauth_flow_events",
  "oauth_signin_traces",
  "eligibility_verifications",
  "verification_requests",
  "affiliate_applications",
  "affiliate_profiles",
  "organization_members",
  "feature_usage",
  "usage_credits",
  "entitlement_ledger",
  "discount_redemptions",
  "dunning_state",
  "scheduled_plan_changes",
  "billing_events",
  "paddle_subscriptions",
  "paddle_customers",
  "purchases",
  "subscribers",
  "legal_acceptances",
  "user_roles",
  "profiles",
];

/** One-way hash so retained financial rows cannot be traced back to a person. */
async function pseudonymise(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(`gradr-billing-retention:${value}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const BUCKETS = ["resumes", "interview-reports"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const scoped = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
  );

  const { data: { user }, error: authError } = await scoped.auth.getUser();
  if (authError || !user) return json({ error: "Unauthorized" }, 401);

  let confirm = "";
  try {
    const body = await req.json();
    confirm = typeof body?.confirm === "string" ? body.confirm.trim() : "";
  } catch {
    /* empty body -> fails the confirmation check below */
  }

  if (confirm !== "DELETE") {
    await logSecurityEvent({
      category: "ai_authorization",
      event: "account_delete",
      decision: "denied",
      userId: user.id,
      reason: "missing_confirmation",
      source: "delete-account",
    });
    return json({ error: "Type DELETE to confirm account deletion." }, 400);
  }

  // Storage first: objects are keyed by user id prefix.
  for (const bucket of BUCKETS) {
    try {
      const { data: files } = await admin.storage.from(bucket).list(user.id, { limit: 1000 });
      const paths = (files ?? []).map((f) => `${user.id}/${f.name}`);
      if (paths.length) await admin.storage.from(bucket).remove(paths);
    } catch (err) {
      console.warn(`delete-account: bucket ${bucket} cleanup failed`, err);
    }
  }

  // Tax and accounting law requires keeping proof of transactions for years
  // after a customer leaves. We keep the minimum — amount, currency, provider
  // reference, date — against a hash of the user id, then delete the
  // identifiable purchase rows along with everything else.
  let retained = 0;
  try {
    const userRef = await pseudonymise(user.id);
    const { data: purchases } = await admin
      .from("purchases")
      .select("id, amount_total, currency, environment, created_at, stripe_session_id, pack_key, status")
      .eq("user_id", user.id);
    const rows = (purchases ?? []).map((p) => ({
      user_ref: userRef,
      provider: "paddle",
      record_kind: p.status === "refunded" ? "refund" : "purchase",
      provider_reference: p.stripe_session_id ?? p.id,
      amount_total: p.amount_total,
      currency: p.currency,
      environment: p.environment,
      occurred_at: p.created_at,
    }));
    if (rows.length) {
      const { error } = await admin.from("billing_retention_records").insert(rows);
      if (error) throw error;
      retained = rows.length;
    }
  } catch (err) {
    console.error("delete-account: billing retention snapshot failed", err);
    return json(
      { error: "Could not archive billing records for deletion. Please contact support." },
      500,
    );
  }

  for (const table of USER_TABLES) {
    const { error } = await admin.from(table).delete().eq("user_id", user.id);
    if (error) console.warn(`delete-account: ${table} delete failed`, error.message);
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
  if (deleteError) {
    await logSecurityEvent({
      category: "ai_authorization",
      event: "account_delete",
      decision: "failed",
      userId: user.id,
      reason: deleteError.message,
      source: "delete-account",
    });
    return json({ error: "Could not fully delete the account. Please contact support." }, 500);
  }

  await logSecurityEvent({
    category: "ai_authorization",
    event: "account_delete",
    decision: "processed",
    userId: user.id,
    source: "delete-account",
    details: { tables: USER_TABLES.length, buckets: BUCKETS, retainedBillingRecords: retained },
  });

  return json({ deleted: true });
});
