import { corsHeaders } from "./shared/cors";
import { createClient } from "@supabase/supabase-js";
import { gatewayFetch, type PaddleEnv } from "./shared/paddle";
import { logSecurityEvent } from "./shared/securityAudit";

/**
 * Resolves the discount a signed-in user is actually entitled to for a plan,
 * and returns a Paddle discount id the checkout can apply.
 *
 * The percentage is decided entirely server-side from verified eligibility —
 * the client cannot request a percentage, only ask "what do I get for this
 * plan?". The webhook re-checks entitlement at fulfillment time, so a leaked
 * discount id cannot silently become a permanent price cut.
 */

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function admin() {
  return createClient(
    process.env['SUPABASE_URL']!,
    process.env['SUPABASE_SERVICE_ROLE_KEY']!,
    { auth: { persistSession: false } },
  );
}

/** Finds (or creates once) the Paddle discount matching a percentage. */
async function paddleDiscountFor(
  env: PaddleEnv,
  percentage: number,
): Promise<string | null> {
  const db = admin();
  const { data: cached } = await db
    .from("paddle_discounts")
    .select("paddle_discount_id")
    .eq("environment", env)
    .eq("percentage", percentage)
    .eq("recurring", true)
    .maybeSingle();
  if (cached?.paddle_discount_id) return cached.paddle_discount_id as string;

  const res = await gatewayFetch(env, "/discounts", {
    method: "POST",
    body: JSON.stringify({
      description: `Gradr eligibility discount ${percentage}%`,
      type: "percentage",
      amount: String(percentage),
      enabled_for_checkout: true,
      recur: true,
      currency_code: null,
    }),
  });

  if (!res.ok) {
    console.error("paddle discount create failed", res.status, await res.text());
    return null;
  }
  const body = await res.json();
  const discountId = body?.data?.id as string | undefined;
  if (!discountId) return null;

  await db.from("paddle_discounts").upsert(
    { environment: env, percentage, recurring: true, paddle_discount_id: discountId },
    { onConflict: "environment,percentage,recurring" },
  );
  return discountId;
}

export const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

  const authed = createClient(
    process.env['SUPABASE_URL']!,
    process.env['SUPABASE_PUBLISHABLE_KEY']!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: claims, error } = await authed.auth.getClaims(authHeader.replace("Bearer ", ""));
  if (error || !claims?.claims?.sub) return json({ error: "Unauthorized" }, 401);
  const userId = claims.claims.sub as string;

  let body: { plan?: string; interval?: string; environment?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const plan = ["starter", "pro", "advanced"].includes(String(body.plan))
    ? String(body.plan)
    : null;
  const interval = ["monthly", "annual"].includes(String(body.interval))
    ? String(body.interval)
    : null;
  const env: PaddleEnv = body.environment === "live" ? "live" : "sandbox";

  const db = admin();
  const { data: resolved, error: rpcError } = await db.rpc("best_discount_for", {
    _user_id: userId,
    _plan: plan,
    _interval: interval,
  });

  if (rpcError) {
    console.error("best_discount_for failed", rpcError.message);
    return json({ percentage: 0 });
  }

  const result = (resolved ?? {}) as {
    percentage?: number;
    rule_id?: string;
    rule_name?: string;
    eligibility_type?: string;
  };
  const percentage = Number(result.percentage ?? 0);
  if (!percentage || percentage <= 0) return json({ percentage: 0 });

  const discountId = await paddleDiscountFor(env, percentage);

  await logSecurityEvent({
    category: "discount",
    event: "checkout_discount_resolved",
    decision: discountId ? "allowed" : "failed",
    userId,
    env,
    source: "resolve-discount",
    details: {
      percentage,
      plan,
      interval,
      rule_id: result.rule_id ?? null,
      eligibility_type: result.eligibility_type ?? null,
    },
  });

  return json({
    percentage,
    discountId,
    ruleId: result.rule_id ?? null,
    ruleName: result.rule_name ?? null,
    eligibilityType: result.eligibility_type ?? null,
  });
};
