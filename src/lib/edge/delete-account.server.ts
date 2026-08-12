/**
 * Permanent account deletion.
 *
 * Verifies the caller's JWT, requires an explicit confirmation phrase, deletes
 * their stored files and rows, then removes the auth user itself. The whole
 * action is written to the security audit log.
 */
import { createClient } from "./shared/supabase";
import { logSecurityEvent } from "./shared/securityAudit";

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

/** User-owned rows, deleted before the auth user disappears. */
const USER_TABLES = [
  "interview_sessions",
  "job_reminders",
  "job_matches",
  "tracked_jobs",
  "resumes",
  "notifications",
  "user_preferences",
  "user_integrations",
  "digest_send_logs",
  "feature_usage",
  "usage_credits",
  "purchases",
  "subscribers",
  "profiles",
];

const BUCKETS = ["resumes", "interview-reports"];

export const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

  const admin = createClient(
    process.env['SUPABASE_URL']!,
    process.env['SUPABASE_SERVICE_ROLE_KEY']!,
    { auth: { persistSession: false } },
  );

  const scoped = createClient(
    process.env['SUPABASE_URL']!,
    process.env['SUPABASE_PUBLISHABLE_KEY']!,
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
    details: { tables: USER_TABLES.length, buckets: BUCKETS },
  });

  return json({ deleted: true });
};
