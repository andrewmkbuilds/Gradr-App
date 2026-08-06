import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3.23.8";

/**
 * Writes RevenueCat entitlement state into `subscribers` so every gate in the
 * app reads the same table regardless of which billing provider is active.
 * Called by the client after a purchase/restore, and safe to call repeatedly.
 */
const BodySchema = z.object({
  active: z.boolean(),
  productIdentifier: z.string().max(200).nullable().optional(),
  expiresDate: z.string().max(64).nullable().optional(),
  willRenew: z.boolean().optional(),
  originalAppUserId: z.string().max(200).optional(),
});

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

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return json({ error: parsed.error.flatten().fieldErrors }, 400);
    }
    const { active, productIdentifier, expiresDate, willRenew } = parsed.data;

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
        price_id: productIdentifier ?? null,
        current_period_end: expiresDate ?? null,
        cancel_at_period_end: active ? willRenew === false : false,
      },
      { onConflict: "user_id" },
    );

    return json({ subscribed: active, tier: active ? tierFor(productIdentifier) : null });
  } catch (err) {
    console.error("revenuecat-sync error", err);
    return json({ error: "Unable to sync entitlements right now." }, 500);
  }
});
