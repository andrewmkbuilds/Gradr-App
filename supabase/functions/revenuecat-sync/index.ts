import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

/**
 * Writes RevenueCat entitlement state into `subscribers` so every gate in the
 * app reads the same table regardless of which billing provider is active.
 *
 * SECURITY: entitlement state is NEVER taken from the request body. The client
 * only asks us to re-sync; we then read the authoritative subscriber record
 * from RevenueCat's REST API (v1 /subscribers/{app_user_id}) using the secret
 * key, keyed on the *authenticated* user's id. A forged request body therefore
 * cannot grant a paid plan.
 */

const PRO_ENTITLEMENT = "pro";

function tierFor(productId: string | null | undefined) {
  if (!productId) return null;
  return productId.toLowerCase().includes("starter") ? "starter" : "pro";
}

function intervalFor(productId: string | null | undefined) {
  if (!productId) return null;
  const id = productId.toLowerCase();
  if (id.includes("year") || id.includes("annual") || id.includes("lifetime")) return "annual";
  if (id.includes("month")) return "monthly";
  return null;
}

interface RcEntitlement {
  expires_date: string | null;
  product_identifier?: string | null;
  unsubscribe_detected_at?: string | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const anon = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData } = await anon.auth.getUser();
    const user = userData?.user;
    if (!user?.email) return json({ error: "Unauthorized" }, 401);

    const secret = Deno.env.get("REVENUECAT_SECRET_KEY");
    if (!secret) {
      console.error("revenuecat-sync: REVENUECAT_SECRET_KEY is not configured");
      return json({ error: "Billing sync is not available right now." }, 503);
    }

    // Authoritative read from RevenueCat, scoped to the caller's own user id.
    const rcRes = await fetch(
      `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(user.id)}`,
      { headers: { Authorization: `Bearer ${secret}`, Accept: "application/json" } },
    );
    if (!rcRes.ok) {
      console.error("revenuecat-sync: RevenueCat API error", rcRes.status);
      return json({ error: "Unable to verify your subscription right now." }, 502);
    }
    const rcBody = await rcRes.json();
    const entitlements = (rcBody?.subscriber?.entitlements ?? {}) as Record<string, RcEntitlement>;
    const ent = entitlements[PRO_ENTITLEMENT];

    const expiresDate = ent?.expires_date ?? null;
    // Lifetime entitlements have a null expiry; otherwise it must be in the future.
    const active = Boolean(ent) && (expiresDate === null || new Date(expiresDate) > new Date());
    const productIdentifier = active ? ent?.product_identifier ?? null : null;
    const willRenew = active ? !ent?.unsubscribe_detected_at : false;

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    await admin.from("subscribers").upsert(
      {
        user_id: user.id,
        email: user.email,
        subscribed: active,
        subscription_tier: active ? tierFor(productIdentifier) : null,
        billing_interval: active ? intervalFor(productIdentifier) : null,
        subscription_status: active ? "active" : "none",
        price_id: productIdentifier,
        current_period_end: expiresDate,
        cancel_at_period_end: active ? !willRenew : false,
      },
      { onConflict: "user_id" },
    );

    return json({ subscribed: active, tier: active ? tierFor(productIdentifier) : null });
  } catch (err) {
    console.error("revenuecat-sync error", err);
    return json({ error: "Unable to sync entitlements right now." }, 500);
  }
});
