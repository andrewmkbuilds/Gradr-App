/**
 * Validates a customer-entered promo code against the payments provider.
 *
 * The client never learns a discount id it isn't entitled to: we only return
 * one when the code exists, is active, is not expired, still has redemptions
 * left, and is enabled for checkout. Attempts are rate-limited per user so the
 * field can't be used to brute-force codes.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { gatewayFetch, type PaddleEnv } from "../_shared/paddle.ts";
import { logSecurityEvent } from "../_shared/securityAudit.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const MAX_ATTEMPTS_PER_HOUR = 15;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

  const authed = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user } } = await authed.auth.getUser();
  if (!user) return json({ error: "Unauthorized" }, 401);

  const body = await req.json().catch(() => ({}));
  const env: PaddleEnv = body?.environment === "live" ? "live" : "sandbox";
  const code = String(body?.code ?? "").trim().toUpperCase();
  if (!code || code.length > 40 || !/^[A-Z0-9_-]+$/.test(code)) {
    return json({ valid: false, reason: "invalid_format" });
  }

  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // Rate limit: count recent attempts from the security audit trail.
  const since = new Date(Date.now() - 60 * 60_000).toISOString();
  const { count } = await db
    .from("security_audit_log")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("event", "promo_code_checked")
    .gte("created_at", since);
  if ((count ?? 0) >= MAX_ATTEMPTS_PER_HOUR) {
    return json({ valid: false, reason: "rate_limited" }, 429);
  }

  const res = await gatewayFetch(env, `/discounts?code=${encodeURIComponent(code)}&status=active`);
  // deno-lint-ignore no-explicit-any
  const rows: any[] = res.ok ? ((await res.json())?.data ?? []) : [];
  const match = rows.find((d) => String(d.code ?? "").toUpperCase() === code);

  const now = Date.now();
  const expired = match?.expires_at ? new Date(match.expires_at).getTime() < now : false;
  const usedUp = match?.usage_limit != null && Number(match.times_used ?? 0) >= Number(match.usage_limit);
  const usable = Boolean(match) && match.status === "active" && match.enabled_for_checkout !== false &&
    !expired && !usedUp;

  await logSecurityEvent({
    category: "discount",
    event: "promo_code_checked",
    decision: usable ? "allowed" : "denied",
    userId: user.id,
    env,
    source: "validate-promo",
    details: { code, found: Boolean(match), expired, used_up: usedUp },
  });

  if (!usable) {
    return json({
      valid: false,
      reason: expired ? "expired" : usedUp ? "usage_limit_reached" : "not_found",
    });
  }

  return json({
    valid: true,
    discountId: match.id,
    code,
    type: match.type,
    amount: match.amount,
    currencyCode: match.currency_code ?? null,
    description: match.description ?? null,
    recurring: Boolean(match.recur),
  });
});
