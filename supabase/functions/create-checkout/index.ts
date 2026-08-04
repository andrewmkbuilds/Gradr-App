import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { ensureProPrice, getStripe, PACKS } from "../_shared/stripe.ts";

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
    const { data: userData, error: userErr } = await anon.auth.getUser();
    const user = userData?.user;
    if (userErr || !user?.email) return json({ error: "Not authenticated" }, 401);

    const body = await req.json().catch(() => ({}));
    const mode: string = body?.mode === "payment" ? "payment" : "subscription";
    const plan: string = body?.plan ?? "monthly";
    const packKey: string | undefined = body?.pack;
    const origin = req.headers.get("origin") ?? "http://localhost:8080";

    if (mode === "subscription" && plan !== "monthly" && plan !== "annual") {
      return json({ error: "Invalid plan" }, 400);
    }
    if (mode === "payment" && (!packKey || !PACKS[packKey])) {
      return json({ error: "Invalid pack" }, 400);
    }

    const stripe = getStripe();
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    // Reuse an existing Stripe customer where possible.
    const { data: sub } = await admin
      .from("subscribers")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle();

    let customerId = sub?.stripe_customer_id as string | undefined;
    if (!customerId) {
      const found = await stripe.customers.list({ email: user.email, limit: 1 });
      customerId = found.data[0]?.id ??
        (await stripe.customers.create({
          email: user.email,
          metadata: { supabase_user_id: user.id },
        })).id;
      await admin.from("subscribers").upsert(
        { user_id: user.id, email: user.email, stripe_customer_id: customerId },
        { onConflict: "user_id" },
      );
    }

    if (mode === "subscription") {
      const price = await ensureProPrice(stripe, plan as "monthly" | "annual");
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: "subscription",
        line_items: [{ price: price.id, quantity: 1 }],
        allow_promotion_codes: true,
        success_url: `${origin}/billing?checkout=success`,
        cancel_url: `${origin}/pricing?checkout=cancelled`,
        subscription_data: { metadata: { supabase_user_id: user.id, plan } },
        metadata: { supabase_user_id: user.id, plan, kind: "subscription" },
      });
      return json({ url: session.url });
    }

    const pack = PACKS[packKey!];
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "payment",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: pack.amount,
            product_data: { name: pack.label },
          },
        },
      ],
      success_url: `${origin}/billing?purchase=success`,
      cancel_url: `${origin}/pricing?purchase=cancelled`,
      metadata: {
        supabase_user_id: user.id,
        kind: "pack",
        pack_key: packKey!,
        credits: String(pack.credits),
        credit_kind: pack.kind,
      },
    });

    await admin.from("purchases").insert({
      user_id: user.id,
      stripe_session_id: session.id,
      pack_key: packKey!,
      pack_label: pack.label,
      quantity: 1,
      credits_granted: 0,
      amount_total: pack.amount,
      currency: "usd",
      status: "pending",
    });

    return json({ url: session.url });
  } catch (err) {
    console.error("create-checkout error", err);
    return json({ error: "Unable to start checkout. Please try again." }, 500);
  }
});
