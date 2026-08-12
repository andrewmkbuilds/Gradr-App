import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

/**
 * Admin RPC gateway.
 *
 * The admin-only SECURITY DEFINER routines are no longer executable by the
 * `authenticated` role, so the browser cannot reach them directly. This
 * function is the single trusted entrypoint: it validates the caller's JWT,
 * rejects anonymous sessions, confirms the admin role server-side, and only
 * then invokes an allowlisted routine with the service role.
 */

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/** Only these routines may be reached through this gateway. */
const ALLOWED = new Set([
  "admin_audit_actors",
  "admin_create_payout",
  "admin_legal_document_stats",
  "admin_mark_payout_paid",
  "admin_publish_legal_document",
  "admin_review_verification",
  "admin_review_verification_request",
  "admin_set_commission_status",
  "admin_verification_requests",
  "approve_affiliate_application",
  "reject_affiliate_application",
  "log_admin_access",
]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "Authentication required" }, 401);

  const url = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  const { data: userData, error: userError } = await admin.auth.getUser(token);
  const user = userData?.user;
  if (userError || !user) return json({ error: "Authentication required" }, 401);
  if (user.is_anonymous) return json({ error: "Admin access required" }, 403);

  const { data: isAdmin, error: roleError } = await admin.rpc("has_role", {
    _user_id: user.id,
    _role: "admin",
  });
  if (roleError || isAdmin !== true) return json({ error: "Admin access required" }, 403);

  let payload: { fn?: unknown; args?: unknown };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Invalid request body" }, 400);
  }

  const fn = typeof payload.fn === "string" ? payload.fn : "";
  if (!ALLOWED.has(fn)) return json({ error: "Unsupported operation" }, 400);

  const args =
    payload.args && typeof payload.args === "object" && !Array.isArray(payload.args)
      ? (payload.args as Record<string, unknown>)
      : {};

  // Execute as the requesting admin's identity for audit columns by passing the
  // caller's JWT through, so auth.uid() inside the routine resolves correctly.
  const asUser = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data, error } = await asUser.rpc(fn, args);
  if (error) {
    console.error("admin-rpc failed", fn, error.message);
    return json({ error: error.message }, 400);
  }

  return json({ data: data ?? null });
});
