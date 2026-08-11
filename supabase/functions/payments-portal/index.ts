import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { getPaddleClient, type PaddleEnv } from "../_shared/paddle.ts";

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
    if (!user) return json({ error: "Not authenticated" }, 401);

    const body = await req.json().catch(() => ({}));
    const env: PaddleEnv = body?.environment === "live" ? "live" : "sandbox";

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );
    const { data: sub } = await admin
      .from("subscribers")
      .select("stripe_customer_id, stripe_subscription_id")
      .eq("user_id", user.id)
      .eq("environment", env)
      .maybeSingle();

    const customerId = sub?.stripe_customer_id as string | undefined;
    if (!customerId) {
      // Credit-pack-only buyers have no subscription record; tell the UI so it
      // can show purchase history instead of a dead-end error.
      return json({ error: "no_billing_account", message: "No subscription to manage yet." }, 404);
    }

    const paddle = getPaddleClient(env);
    const session = await paddle.customerPortalSessions.create(
      customerId,
      sub?.stripe_subscription_id ? [sub.stripe_subscription_id as string] : [],
    );

    return json({ url: session.urls?.general?.overview });
  } catch (err) {
    console.error("payments-portal error", err);
    return json({ error: "Unable to open the billing portal. Please try again." }, 500);
  }
});
