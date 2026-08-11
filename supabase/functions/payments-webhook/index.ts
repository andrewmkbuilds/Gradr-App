import { createClient } from "npm:@supabase/supabase-js@2";
import {
  CREDIT_PACKS,
  EventName,
  PLAN_PRICES,
  verifyWebhook,
  type PaddleEnv,
} from "../_shared/paddle.ts";

let _supabase: ReturnType<typeof createClient> | null = null;
function db() {
  if (!_supabase) {
    _supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );
  }
  return _supabase;
}

async function emailFor(userId: string): Promise<string> {
  const { data: row } = await db()
    .from("subscribers")
    .select("email")
    .eq("user_id", userId)
    .maybeSingle();
  if (row?.email) return row.email as string;
  const { data } = await db().auth.admin.getUserById(userId);
  return data?.user?.email ?? "unknown@gradr.local";
}

// deno-lint-ignore no-explicit-any
async function upsertSubscription(data: any) {
  const userId = data?.customData?.userId;
  if (!userId) {
    console.error("payments-webhook: no userId in customData");
    return;
  }

  const item = data.items?.[0];
  const externalPriceId = item?.price?.importMeta?.externalId as string | undefined;
  if (!externalPriceId) {
    console.warn("payments-webhook: missing importMeta.externalId", { rawPriceId: item?.price?.id });
    return;
  }

  const plan = PLAN_PRICES[externalPriceId];
  const status: string = data.status ?? "active";
  const entitled = ["active", "trialing"].includes(status);

  await db().from("subscribers").upsert(
    {
      user_id: userId,
      email: await emailFor(userId),
      // Provider customer/subscription identifiers (Paddle).
      stripe_customer_id: data.customerId ?? null,
      stripe_subscription_id: data.id ?? null,
      subscribed: entitled,
      subscription_tier: entitled ? plan?.tier ?? "pro" : null,
      billing_interval: plan?.interval ?? null,
      subscription_status: status,
      price_id: externalPriceId,
      current_period_end: data.currentBillingPeriod?.endsAt ?? null,
      cancel_at_period_end: data.scheduledChange?.action === "cancel",
    },
    { onConflict: "user_id" },
  );
}

// deno-lint-ignore no-explicit-any
async function updateSubscription(data: any) {
  const status: string = data.status ?? "active";
  await db()
    .from("subscribers")
    .update({
      subscribed: ["active", "trialing"].includes(status),
      subscription_status: status,
      current_period_end: data.currentBillingPeriod?.endsAt ?? null,
      cancel_at_period_end: data.scheduledChange?.action === "cancel",
      ...(status === "canceled" ? { subscription_tier: null } : {}),
    })
    .eq("stripe_subscription_id", data.id);
}

/** One-off credit packs are granted from completed transactions. */
// deno-lint-ignore no-explicit-any
async function grantPackCredits(data: any) {
  const userId = data?.customData?.userId;
  if (!userId) return;

  for (const item of data.items ?? []) {
    const priceId = item?.price?.importMeta?.externalId as string | undefined;
    const pack = priceId ? CREDIT_PACKS[priceId] : undefined;
    if (!pack) continue;

    // Idempotency: a transaction id is only ever granted once.
    const { data: existing } = await db()
      .from("purchases")
      .select("id")
      .eq("stripe_session_id", data.id)
      .maybeSingle();
    if (existing) continue;

    const quantity = Number(item?.quantity ?? 1) || 1;
    const credits = pack.credits * quantity;

    await db().from("purchases").insert({
      user_id: userId,
      stripe_session_id: data.id,
      pack_key: priceId,
      pack_label: pack.label,
      quantity,
      credits_granted: credits,
      amount_total: Number(data.details?.totals?.total ?? 0),
      currency: (data.currencyCode ?? "usd").toLowerCase(),
      status: "paid",
    });

    const { data: current } = await db()
      .from("usage_credits")
      .select("application_credits, interview_credits")
      .eq("user_id", userId)
      .maybeSingle();

    await db().from("usage_credits").upsert(
      {
        user_id: userId,
        application_credits: Number(current?.application_credits ?? 0) +
          (pack.kind === "application" ? credits : 0),
        interview_credits: Number(current?.interview_credits ?? 0) +
          (pack.kind === "interview" ? credits : 0),
      },
      { onConflict: "user_id" },
    );
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const env = (new URL(req.url).searchParams.get("env") || "sandbox") as PaddleEnv;

  try {
    const event = await verifyWebhook(req, env);
    switch (event.eventType) {
      case EventName.SubscriptionCreated:
        await upsertSubscription(event.data);
        break;
      case EventName.SubscriptionUpdated:
        await updateSubscription(event.data);
        break;
      case EventName.SubscriptionCanceled:
        await updateSubscription({ ...event.data, status: "canceled" });
        break;
      case EventName.TransactionCompleted:
        await grantPackCredits(event.data);
        break;
      default:
        console.log("Unhandled event:", event.eventType);
    }
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Webhook error:", e);
    return new Response("Webhook error", { status: 400 });
  }
});
