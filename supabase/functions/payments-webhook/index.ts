import { createClient } from "npm:@supabase/supabase-js@2";
import {
  CREDIT_PACKS,
  EventName,
  PLAN_PRICES,
  verifyWebhook,
  type PaddleEnv,
} from "../_shared/paddle.ts";
import { logSecurityEvent } from "../_shared/securityAudit.ts";

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

async function emailFor(userId: string, env: PaddleEnv): Promise<string> {
  const { data: row } = await db()
    .from("subscribers")
    .select("email")
    .eq("user_id", userId)
    .eq("environment", env)
    .maybeSingle();
  if (row?.email) return row.email as string;
  const { data } = await db().auth.admin.getUserById(userId);
  return data?.user?.email ?? "unknown@gradr.local";
}


/** ---- Paddle state mirror (customers + subscriptions) --------------------- */

async function existingEmail(customerId: string): Promise<string | null> {
  const { data } = await db()
    .from("paddle_customers")
    .select("email")
    .eq("customer_id", customerId)
    .maybeSingle();
  return (data?.email as string | undefined) ?? null;
}

// deno-lint-ignore no-explicit-any
async function mirrorCustomer(data: any, env: PaddleEnv, userId?: string | null) {
  if (!data?.id) return;
  const patch: Record<string, unknown> = {
    customer_id: data.id,
    environment: env,
    updated_at: new Date().toISOString(),
  };
  // Never overwrite a known email with a placeholder.
  if (data.email) patch.email = data.email;
  else patch.email = (await existingEmail(data.id)) ?? "unknown@gradr.local";
  if (userId) patch.user_id = userId;
  // Idempotent: keyed on the Paddle customer id, safe for out-of-order retries.
  await db().from("paddle_customers").upsert(patch, { onConflict: "customer_id" });
}

// deno-lint-ignore no-explicit-any
async function mirrorSubscription(data: any, env: PaddleEnv) {
  if (!data?.id) return;
  const item = data.items?.[0];
  const userId = data?.customData?.userId ?? null;

  if (data.customerId) {
    await mirrorCustomer(
      { id: data.customerId, email: userId ? await emailFor(userId, env) : undefined },
      env,
      userId,
    );
  }

  const patch: Record<string, unknown> = {
    subscription_id: data.id,
    customer_id: data.customerId ?? "unknown",
    status: data.status ?? "active",
    price_id: item?.price?.importMeta?.externalId ?? item?.price?.id ?? "unknown",
    product_id: item?.product?.importMeta?.externalId ?? item?.price?.productId ?? "unknown",
    scheduled_change_action: data.scheduledChange?.action ?? null,
    scheduled_change_at: data.scheduledChange?.effectiveAt ?? null,
    current_period_end: data.currentBillingPeriod?.endsAt ?? null,
    environment: env,
    updated_at: new Date().toISOString(),
  };
  if (userId) patch.user_id = userId;

  await db().from("paddle_subscriptions").upsert(patch, { onConflict: "subscription_id" });
}

/**
 * Access is granted while Paddle is still collecting: `past_due` keeps working
 * through dunning, and a cancelled/paused plan keeps working until the paid
 * period actually ends. Revoking early and re-granting is worse than trusting
 * Paddle's retry flow.
 */
function isEntitled(status: string, periodEnd: string | null): boolean {
  if (["active", "trialing", "past_due"].includes(status)) return true;
  if (["canceled", "paused"].includes(status)) {
    return Boolean(periodEnd) && new Date(periodEnd as string) > new Date();
  }
  return false;
}

// deno-lint-ignore no-explicit-any
function planFromItems(data: any) {
  const item = data?.items?.[0];
  const externalPriceId = item?.price?.importMeta?.externalId as string | undefined;
  return { externalPriceId, plan: externalPriceId ? PLAN_PRICES[externalPriceId] : undefined };
}

// deno-lint-ignore no-explicit-any
async function upsertSubscription(data: any, env: PaddleEnv) {
  const userId = data?.customData?.userId;
  if (!userId) {
    console.error("payments-webhook: no userId in customData");
    return;
  }

  const { externalPriceId, plan } = planFromItems(data);
  if (!externalPriceId) {
    // Raw pri_… ids differ between sandbox and live, so writing one would
    // silently break tier gating after publish.
    console.warn("payments-webhook: missing importMeta.externalId", {
      rawPriceId: data.items?.[0]?.price?.id,
    });
    return;
  }

  const status: string = data.status ?? "active";
  const periodEnd = data.currentBillingPeriod?.endsAt ?? null;
  const entitled = isEntitled(status, periodEnd);

  await db().from("subscribers").upsert(
    {
      user_id: userId,
      email: await emailFor(userId, env),
      environment: env,
      // Provider customer/subscription identifiers (Paddle).
      stripe_customer_id: data.customerId ?? null,
      stripe_subscription_id: data.id ?? null,
      subscribed: entitled,
      // Tier always follows the price that is actually on the subscription,
      // so upgrades and downgrades land on the right plan.
      subscription_tier: entitled ? plan?.tier ?? "pro" : null,
      billing_interval: plan?.interval ?? null,
      subscription_status: status,
      price_id: externalPriceId,
      current_period_end: periodEnd,
      cancel_at_period_end: data.scheduledChange?.action === "cancel",
    },
    { onConflict: "user_id,environment" },
  );
}

// deno-lint-ignore no-explicit-any
async function updateSubscription(data: any, env: PaddleEnv) {
  const status: string = data.status ?? "active";
  const periodEnd = data.currentBillingPeriod?.endsAt ?? null;
  const entitled = isEntitled(status, periodEnd);
  const { externalPriceId, plan } = planFromItems(data);

  const patch: Record<string, unknown> = {
    subscribed: entitled,
    subscription_status: status,
    current_period_end: periodEnd,
    cancel_at_period_end: data.scheduledChange?.action === "cancel",
    subscription_tier: entitled ? plan?.tier ?? undefined : null,
  };
  if (externalPriceId) {
    // Plan changes arrive as subscription.updated with new items.
    patch.price_id = externalPriceId;
    if (plan?.interval) patch.billing_interval = plan.interval;
  }
  if (patch.subscription_tier === undefined) delete patch.subscription_tier;

  const { data: updated } = await db()
    .from("subscribers")
    .update(patch)
    .eq("stripe_subscription_id", data.id)
    .eq("environment", env)
    .select("user_id");

  // Out-of-order delivery: an update can arrive before the created event.
  // Rebuild the row from the event rather than dropping the entitlement.
  if (!updated?.length && data?.customData?.userId) {
    await upsertSubscription(data, env);
  }
}

/** Dunning: a failed renewal marks the plan past_due and warns the customer. */
// deno-lint-ignore no-explicit-any
async function handlePaymentFailed(data: any, env: PaddleEnv) {
  const subscriptionId = data?.subscriptionId ?? null;
  const userId = data?.customData?.userId ?? null;

  let query = db()
    .from("subscribers")
    .update({ subscription_status: "past_due" })
    .eq("environment", env);
  query = subscriptionId
    ? query.eq("stripe_subscription_id", subscriptionId)
    : userId
      ? query.eq("user_id", userId)
      : query.eq("user_id", "00000000-0000-0000-0000-000000000000");

  const { data: rows } = await query.select("user_id");
  const target = (rows?.[0]?.user_id as string | undefined) ?? userId;
  if (!target) return;

  await db().rpc("enqueue_notification", {
    _user_id: target,
    _type: "billing_payment_failed",
    _title: "Your last payment failed",
    _body: "Update your card to keep your plan active — we'll keep retrying in the meantime.",
    _link: "/billing",
    _metadata: { subscription_id: subscriptionId },
  });
}

/** A completed payment clears a prior dunning state. */
// deno-lint-ignore no-explicit-any
async function clearPaymentIssue(data: any, env: PaddleEnv) {
  const subscriptionId = data?.subscriptionId ?? null;
  if (!subscriptionId) return;
  await db()
    .from("subscribers")
    .update({ subscribed: true, subscription_status: "active" })
    .eq("stripe_subscription_id", subscriptionId)
    .eq("environment", env)
    .eq("subscription_status", "past_due");
}


/** One-off credit packs are granted from completed transactions. */
// deno-lint-ignore no-explicit-any
async function grantPackCredits(data: any, env: PaddleEnv) {
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
      .eq("environment", env)
      .maybeSingle();
    if (existing) continue;

    const quantity = Number(item?.quantity ?? 1) || 1;
    const credits = pack.credits * quantity;

    await db().from("purchases").insert({
      user_id: userId,
      stripe_session_id: data.id,
      environment: env,
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
      .eq("environment", env)
      .maybeSingle();

    await db().from("usage_credits").upsert(
      {
        user_id: userId,
        environment: env,
        application_credits: Number(current?.application_credits ?? 0) +
          (pack.kind === "application" ? credits : 0),
        interview_credits: Number(current?.interview_credits ?? 0) +
          (pack.kind === "interview" ? credits : 0),
      },
      { onConflict: "user_id,environment" },
    );
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const env = (new URL(req.url).searchParams.get("env") || "sandbox") as PaddleEnv;

  try {
    const event = await verifyWebhook(req, env);
    // deno-lint-ignore no-explicit-any
    const eventUserId = ((event.data as any)?.customData?.userId ?? null) as string | null;

    await logSecurityEvent({
      category: "billing_webhook",
      event: String(event.eventType),
      decision: "received",
      userId: eventUserId,
      env,
      source: "payments-webhook",
      // deno-lint-ignore no-explicit-any
      details: { event_id: (event as any)?.eventId ?? null, status: (event.data as any)?.status ?? null },
    });

    switch (event.eventType) {
      case EventName.SubscriptionCreated:
        await mirrorSubscription(event.data, env);
        await upsertSubscription(event.data, env);
        break;
      case EventName.SubscriptionUpdated:
        // A scheduled cancellation is NOT a cancellation: we mirror the
        // scheduled change but keep the status Paddle reports.
        await mirrorSubscription(event.data, env);
        await updateSubscription(event.data, env);
        break;
      case EventName.SubscriptionCanceled:
        await mirrorSubscription({ ...event.data, status: "canceled" }, env);
        await updateSubscription({ ...event.data, status: "canceled" }, env);
        break;
      case EventName.CustomerCreated:
      case EventName.CustomerUpdated:
        await mirrorCustomer(event.data, env);
        break;
      case EventName.TransactionCompleted:
        await clearPaymentIssue(event.data, env);
        await grantPackCredits(event.data, env);
        break;
      case EventName.TransactionPaymentFailed:
        await handlePaymentFailed(event.data, env);
        break;

      default:
        console.log("Unhandled event:", event.eventType);
    }
    await logSecurityEvent({
      category: "billing_webhook",
      event: String(event.eventType),
      decision: "processed",
      userId: eventUserId,
      env,
      source: "payments-webhook",
    });

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Webhook error:", e);
    await logSecurityEvent({
      category: "billing_webhook",
      event: "verification_or_handler_error",
      decision: "failed",
      env,
      source: "payments-webhook",
      reason: e instanceof Error ? e.message : String(e),
    });
    return new Response("Webhook error", { status: 400 });
  }
});
