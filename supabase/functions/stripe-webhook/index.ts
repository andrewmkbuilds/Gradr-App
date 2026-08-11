import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { getStripe, resolveTier } from "../_shared/stripe.ts";
import type Stripe from "https://esm.sh/stripe@18.5.0?target=deno";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

function planFromInterval(interval?: string | null) {
  if (interval === "year") return "annual";
  if (interval === "month") return "monthly";
  return null;
}

async function resolveUserId(
  stripe: Stripe,
  customerId: string,
  metaUserId?: string | null,
): Promise<string | null> {
  if (metaUserId) return metaUserId;

  const { data } = await admin
    .from("subscribers")
    .select("user_id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  if (data?.user_id) return data.user_id;

  const customer = await stripe.customers.retrieve(customerId);
  if (!("deleted" in customer) || !customer.deleted) {
    const meta = (customer as Stripe.Customer).metadata?.supabase_user_id;
    if (meta) return meta;
  }
  return null;
}

async function syncSubscription(stripe: Stripe, subscription: Stripe.Subscription) {
  const customerId = typeof subscription.customer === "string"
    ? subscription.customer
    : subscription.customer.id;
  const userId = await resolveUserId(
    stripe,
    customerId,
    subscription.metadata?.supabase_user_id,
  );
  if (!userId) {
    console.error("subscription sync: no user for customer", customerId);
    return;
  }

  const item = subscription.items.data[0];
  const interval = item?.price?.recurring?.interval;
  const active = ["active", "trialing", "past_due"].includes(subscription.status);
  const periodEnd = (item as unknown as { current_period_end?: number })?.current_period_end ??
    (subscription as unknown as { current_period_end?: number }).current_period_end;

  const { data: existing } = await admin
    .from("subscribers")
    .select("email")
    .eq("user_id", userId)
    .maybeSingle();

  let email = existing?.email as string | undefined;
  if (!email) {
    const { data: authUser } = await admin.auth.admin.getUserById(userId);
    email = authUser?.user?.email ?? "unknown@careerflow.local";
  }

  await admin.from("subscribers").upsert(
    {
      user_id: userId,
      email,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscription.id,
      subscribed: active && subscription.status !== "past_due",
      subscription_tier: active
        ? resolveTier({
          lookupKey: item?.price?.lookup_key,
          metadataTier: subscription.metadata?.tier,
          productMetadataTier:
            (item?.price?.product as { metadata?: Record<string, string> } | undefined)?.metadata
              ?.careerflow_product,
          amount: item?.price?.unit_amount,
        })
        : null,
      billing_interval: planFromInterval(interval),
      subscription_status: subscription.status,
      price_id: item?.price?.id ?? null,
      current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      cancel_at_period_end: Boolean(subscription.cancel_at_period_end),
    },
    { onConflict: "user_id" },
  );
}

async function grantPackCredits(stripe: Stripe, session: Stripe.Checkout.Session) {
  const meta = session.metadata ?? {};
  if (meta.kind !== "pack") return;

  const customerId = typeof session.customer === "string"
    ? session.customer
    : session.customer?.id ?? "";
  const userId = await resolveUserId(stripe, customerId, meta.supabase_user_id);
  if (!userId) return;

  // Idempotency: only grant when the row is still pending.
  const { data: existing } = await admin
    .from("purchases")
    .select("id, status")
    .eq("stripe_session_id", session.id)
    .maybeSingle();
  if (existing?.status === "paid") return;

  const credits = Number(meta.credits ?? 0);
  const creditKind = meta.credit_kind === "interview" ? "interview" : "application";

  const record = {
    user_id: userId,
    stripe_session_id: session.id,
    stripe_payment_intent_id: typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id ?? null,
    pack_key: meta.pack_key ?? "unknown",
    pack_label: meta.pack_label ?? null,
    quantity: 1,
    credits_granted: credits,
    amount_total: session.amount_total ?? 0,
    currency: session.currency ?? "usd",
    status: "paid",
  };

  if (existing) {
    await admin.from("purchases").update(record).eq("id", existing.id);
  } else {
    await admin.from("purchases").insert(record);
  }

  const { data: current } = await admin
    .from("usage_credits")
    .select("application_credits, interview_credits")
    .eq("user_id", userId)
    .maybeSingle();

  await admin.from("usage_credits").upsert(
    {
      user_id: userId,
      application_credits: (current?.application_credits ?? 0) +
        (creditKind === "application" ? credits : 0),
      interview_credits: (current?.interview_credits ?? 0) +
        (creditKind === "interview" ? credits : 0),
    },
    { onConflict: "user_id" },
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const secret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!secret) {
    console.error("STRIPE_WEBHOOK_SECRET is not configured");
    return new Response(JSON.stringify({ error: "Webhook not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) return new Response("Missing signature", { status: 400, headers: corsHeaders });

  const stripe = getStripe();
  const payload = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(payload, signature, secret);
  } catch (err) {
    console.error("Invalid webhook signature", err);
    return new Response("Invalid signature", { status: 400, headers: corsHeaders });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode === "payment" && session.payment_status === "paid") {
          await grantPackCredits(stripe, session);
        }
        if (session.mode === "subscription" && session.subscription) {
          const subId = typeof session.subscription === "string"
            ? session.subscription
            : session.subscription.id;
          await syncSubscription(stripe, await stripe.subscriptions.retrieve(subId));
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
      case "customer.subscription.paused":
      case "customer.subscription.resumed": {
        await syncSubscription(stripe, event.data.object as Stripe.Subscription);
        break;
      }
      case "invoice.paid":
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const subId = (invoice as unknown as { subscription?: string | { id: string } })
          .subscription;
        if (subId) {
          const id = typeof subId === "string" ? subId : subId.id;
          await syncSubscription(stripe, await stripe.subscriptions.retrieve(id));
        }
        break;
      }
      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;
        if (charge.payment_intent) {
          const pi = typeof charge.payment_intent === "string"
            ? charge.payment_intent
            : charge.payment_intent.id;
          await admin.from("purchases").update({ status: "refunded" })
            .eq("stripe_payment_intent_id", pi);
        }
        break;
      }
      default:
        break;
    }
  } catch (err) {
    console.error(`Error handling ${event.type}`, err);
    return new Response(JSON.stringify({ error: "Handler failure" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
