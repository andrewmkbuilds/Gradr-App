import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { getStripe, resolveTier } from "../_shared/stripe.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) return json({ error: "Not authenticated" }, 401);

    const anon = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData } = await anon.auth.getUser();
    const user = userData?.user;
    if (!user?.email) return json({ error: "Not authenticated" }, 401);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );
    const stripe = getStripe();

    // Locate the Stripe customer (restore purchases after re-signup uses the email match).
    const { data: row } = await admin
      .from("subscribers")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle();

    let customerId = row?.stripe_customer_id as string | undefined;
    if (!customerId) {
      const found = await stripe.customers.list({ email: user.email, limit: 1 });
      customerId = found.data[0]?.id;
    }

    if (!customerId) {
      await admin.from("subscribers").upsert(
        { user_id: user.id, email: user.email, subscribed: false, subscription_tier: null },
        { onConflict: "user_id" },
      );
      return json({ subscribed: false, tier: null });
    }

    const subs = await stripe.subscriptions.list({
      customer: customerId,
      status: "all",
      limit: 10,
      expand: ["data.items.data.price.product"],
    });
    const active = subs.data.find((s) => ["active", "trialing", "past_due"].includes(s.status));
    const item = active?.items.data[0];
    const interval = item?.price?.recurring?.interval;
    const product = item?.price?.product as { metadata?: Record<string, string> } | undefined;
    const tier = active
      ? resolveTier({
        lookupKey: item?.price?.lookup_key,
        metadataTier: active.metadata?.tier,
        productMetadataTier: product?.metadata?.careerflow_product,
        amount: item?.price?.unit_amount,
      })
      : null;
    const periodEnd = (item as unknown as { current_period_end?: number })?.current_period_end ??
      (active as unknown as { current_period_end?: number })?.current_period_end;

    await admin.from("subscribers").upsert(
      {
        user_id: user.id,
        email: user.email,
        stripe_customer_id: customerId,
        stripe_subscription_id: active?.id ?? null,
        subscribed: Boolean(active) && active!.status !== "past_due",
        subscription_tier: tier,
        billing_interval: interval === "year" ? "annual" : interval === "month" ? "monthly" : null,
        subscription_status: active?.status ?? "none",
        price_id: item?.price?.id ?? null,
        current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
        cancel_at_period_end: Boolean(active?.cancel_at_period_end),
      },
      { onConflict: "user_id" },
    );

    return json({
      subscribed: Boolean(active) && active!.status !== "past_due",
      tier,
      status: active?.status ?? "none",
      billing_interval: interval === "year" ? "annual" : interval === "month" ? "monthly" : null,
      current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      cancel_at_period_end: Boolean(active?.cancel_at_period_end),
    });
  } catch (err) {
    console.error("check-subscription error", err);
    return json({ error: "Unable to verify subscription right now." }, 500);
  }
});
