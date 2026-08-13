/**
 * Admin endpoint for reading and editing per-endpoint reliability policy.
 *
 * Limits used to live only in code, which meant tuning a bucket required a
 * deploy — exactly the wrong loop when an endpoint is being throttled in
 * production. Admins can now edit limit, window, backoff and alert thresholds
 * inline; every write is recorded in `admin_audit_log` with the before/after
 * values so a bad change is traceable and reversible.
 *
 * Actions:
 *  - `list`   : code defaults merged with current overrides
 *  - `save`   : upsert an override (audited)
 *  - `reset`  : delete an override, restoring the code default (audited)
 *  - `audit`  : recent policy changes
 */
import { corsHeaders } from "./shared/cors";
import { createClient } from "./shared/supabase";
import {
  basePolicyFor,
  listPolicies,
  policyFor,
  type EndpointPolicy,
} from "./shared/endpointPolicy";
import { invalidatePolicyOverrides } from "./shared/policyOverrides";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const AUDIT_ACTION = "endpoint_policy_change";

/** Bounds keep an accidental keystroke from disabling protection entirely. */
function sanitise(body: Record<string, unknown>) {
  const int = (key: string, min: number, max: number): number | null => {
    const raw = body[key];
    if (raw === null || raw === undefined || raw === "") return null;
    const n = Math.round(Number(raw));
    if (!Number.isFinite(n)) return null;
    return Math.min(max, Math.max(min, n));
  };
  return {
    rate_limit: int("rateLimit", 1, 100_000),
    window_ms: int("windowMs", 1_000, 3_600_000),
    backoff_seconds: int("backoffSeconds", 0, 3_600),
    max_backoff_seconds: int("maxBackoffSeconds", 0, 86_400),
    alert_server_error: int("alertServerError", 1, 1_000),
    alert_rate_limited: int("alertRateLimited", 1, 10_000),
    alert_auth_rejected: int("alertAuthRejected", 1, 10_000),
    alert_client_error: int("alertClientError", 1, 10_000),
    disabled: body["disabled"] === true,
    note: typeof body["note"] === "string" ? (body["note"] as string).slice(0, 300) : null,
  };
}

function flatten(policy: EndpointPolicy) {
  const rule = policy.rateLimit;
  return {
    limit: rule === false ? null : rule.limit,
    windowMs: rule === false ? null : rule.windowMs,
    backoffSeconds: rule === false ? null : (rule.backoffSeconds ?? null),
    maxBackoffSeconds: rule === false ? null : (rule.maxBackoffSeconds ?? null),
    disabled: rule === false,
    alertAfter: policy.alertAfter,
  };
}

export const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "Authentication required" }, 401);

  const admin = createClient(
    process.env["SUPABASE_URL"]!,
    process.env["SUPABASE_SERVICE_ROLE_KEY"]!,
    { auth: { persistSession: false } },
  );

  const { data: userData, error: userError } = await admin.auth.getUser(token);
  const user = userData?.user;
  if (userError || !user) return json({ error: "Authentication required" }, 401);
  if (user.is_anonymous) return json({ error: "Admin access required" }, 403);

  const { data: isAdmin, error: roleError } = await admin.rpc("has_role", {
    _user_id: user.id,
    _role: "admin",
  });
  if (roleError || isAdmin !== true) return json({ error: "Admin access required" }, 403);

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "Invalid request body" }, 400);
  }

  const action = typeof body["action"] === "string" ? (body["action"] as string) : "list";
  const endpoint = typeof body["endpoint"] === "string" ? (body["endpoint"] as string) : "";

  const readOverrides = async () => {
    const { data } = await admin
      .from("endpoint_policy_overrides")
      .select("*")
      .order("endpoint");
    return data ?? [];
  };

  /* -------------------------------- list -------------------------------- */
  if (action === "list") {
    const overrides = await readOverrides();
    // Refresh the local cache so the numbers shown match what the limiter uses.
    invalidatePolicyOverrides();
    return json({
      endpoints: listPolicies().map(({ endpoint: name }) => ({
        endpoint: name,
        base: flatten(basePolicyFor(name)),
        effective: flatten(policyFor(name)),
        override: overrides.find((o: any) => o.endpoint === name) ?? null,
      })),
      overrides,
    });
  }

  /* -------------------------------- save -------------------------------- */
  if (action === "save" || action === "reset") {
    if (!endpoint || !endpoint.startsWith("/api/public/")) {
      return json({ error: "A valid /api/public/* endpoint is required" }, 400);
    }

    const { data: before } = await admin
      .from("endpoint_policy_overrides")
      .select("*")
      .eq("endpoint", endpoint)
      .maybeSingle();

    let after: unknown = null;

    if (action === "reset") {
      if (!before) return json({ error: "No override to reset" }, 404);
      const { error } = await admin
        .from("endpoint_policy_overrides")
        .delete()
        .eq("endpoint", endpoint);
      if (error) return json({ error: error.message }, 500);
    } else {
      const values = sanitise(body);
      const { data, error } = await admin
        .from("endpoint_policy_overrides")
        .upsert(
          { endpoint, ...values, updated_by: user.id, updated_at: new Date().toISOString() },
          { onConflict: "endpoint" },
        )
        .select("*")
        .maybeSingle();
      if (error) return json({ error: error.message }, 500);
      after = data;
    }

    await admin.from("admin_audit_log").insert({
      actor_id: user.id,
      action: AUDIT_ACTION,
      resource_type: "endpoint_policy",
      resource_id: endpoint,
      record_count: 1,
      details: {
        operation: action,
        before: before ?? null,
        after,
        base: flatten(basePolicyFor(endpoint)),
      },
    });

    invalidatePolicyOverrides();
    return json({ ok: true, endpoint, override: after });
  }

  /* -------------------------------- audit ------------------------------- */
  if (action === "audit") {
    const { data, error } = await admin
      .from("admin_audit_log")
      .select("id, actor_id, action, resource_id, details, created_at")
      .eq("action", AUDIT_ACTION)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) return json({ error: error.message }, 500);
    return json({ rows: data ?? [] });
  }

  return json({ error: "Unknown action" }, 400);
};
