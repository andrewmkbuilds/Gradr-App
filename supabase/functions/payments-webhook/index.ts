import { createClient } from "npm:@supabase/supabase-js@2";
import {
  ANNUAL_BONUS,
  CREDIT_PACKS,
  EventName,
  PLAN_PRICES,
  verifyWebhook,
  type PaddleEnv,
} from "../_shared/paddle.ts";
import {
  isEntitled,
  periodEndOf,
  trialEndOf,
  trialStartOf,
  priceExternalId,
  userIdOf,
  type PaddleEventData,
  type PaddleLineItem,
  type PaddleWebhookEvent,
} from "../_shared/paddleEvent.ts";
import { logSecurityEvent } from "../_shared/securityAudit.ts";
import { capture as phCapture, setPerson as phSetPerson } from "../_shared/posthog.ts";
import { formatDate, formatMoney, sendTransactionalEmail } from "../_shared/sendTransactional.ts";
import { closeDunning, openDunning, recordBillingEvent } from "../_shared/billingLedger.ts";
import {
  notifyUser,
  recordLedgerEntry,
  reverseEntitlementsForAdjustment,
} from "../_shared/entitlementLedger.ts";

/**
 * Payload shapes and every field accessor live in `_shared/paddleEvent.ts` so
 * they can be contract-tested against real Paddle events
 * (src/test/paymentsWebhookContract.test.ts).
 */

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

/** Billing emails are best-effort; a delivery problem never fails a webhook. */
async function billingEmail(
  template: string,
  recipient: string | null | undefined,
  idempotencyKey: string,
  templateData: Record<string, unknown>,
) {
  if (!recipient || recipient === "unknown@gradr.local") return;
  await sendTransactionalEmail({
    templateName: template,
    recipientEmail: recipient,
    idempotencyKey,
    templateData,
  });
}

function planLabel(tier?: string | null, interval?: string | null): string {
  const name = tier ? `Gradr ${tier.charAt(0).toUpperCase()}${tier.slice(1)}` : "Gradr Pro";
  return interval ? `${name} (${interval})` : name;
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

async function mirrorCustomer(data: PaddleEventData, env: PaddleEnv, userId?: string | null) {
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

async function mirrorSubscription(data: PaddleEventData, env: PaddleEnv) {
  if (!data?.id) return;
  const item = data.items?.[0];
  const userId = userIdOf(data);

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
    price_id: priceExternalId(item) ?? item?.price?.id ?? "unknown",
    product_id: item?.product?.customData?.external_id ?? item?.product?.importMeta?.externalId ?? item?.price?.productId ?? "unknown",
    scheduled_change_action: data.scheduledChange?.action ?? null,
    scheduled_change_at: data.scheduledChange?.effectiveAt ?? null,
    current_period_end: data.currentBillingPeriod?.endsAt ?? null,
    environment: env,
    updated_at: new Date().toISOString(),
  };
  if (userId) patch.user_id = userId;

  await db().from("paddle_subscriptions").upsert(patch, { onConflict: "subscription_id" });
}



/** Free-trial length, mirrored from src/config/pricing.ts and the Paddle price. */
const TRIAL_DAYS = 7;

function planFromItems(data: PaddleEventData) {
  const item = data?.items?.[0];
  const externalPriceId = priceExternalId(item);
  return { externalPriceId, plan: externalPriceId ? PLAN_PRICES[externalPriceId] : undefined };
}

async function upsertSubscription(data: PaddleEventData, env: PaddleEnv) {
  const userId = userIdOf(data);
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
  const periodEnd = periodEndOf(data);
  const entitled = isEntitled(status, periodEnd);
  const trialStart = trialStartOf(data);
  const trialEnd = trialEndOf(data);
  const trialing = status === "trialing";

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
      trial_start: trialStart,
      trial_end: trialEnd,
    },
    { onConflict: "user_id,environment" },
  );

  if (entitled && plan?.interval === "annual" && plan.tier) {
    await grantAnnualBonus(userId, String(data.id), plan.tier, env);
  }

  if (entitled && trialing) {
    // A trial start is not a purchase — the customer has been charged nothing
    // yet, so they get the trial mail instead of the welcome-to-Pro receipt.
    await billingEmail("trial-started", await emailFor(userId, env), `trial-started-${data.id}`, {
      planName: planLabel(plan?.tier, plan?.interval),
      trialDays: TRIAL_DAYS,
      trialEndsOn: formatDate(trialEnd ?? periodEnd),
      interval: plan?.interval ?? undefined,
    });
  } else if (entitled) {
    // Idempotency is keyed on the subscription id so Paddle retries of the same
    // created event never double-send the welcome-to-Pro mail.
    await billingEmail("subscription-started", await emailFor(userId, env), `sub-started-${data.id}`, {
      planName: planLabel(plan?.tier, plan?.interval),
      interval: plan?.interval ?? undefined,
      nextBillingDate: formatDate(periodEnd),
    });
  }
}

async function updateSubscription(data: PaddleEventData, env: PaddleEnv) {
  const status: string = data.status ?? "active";
  const periodEnd = periodEndOf(data);
  const entitled = isEntitled(status, periodEnd);
  const { externalPriceId, plan } = planFromItems(data);

  const trialEnd = trialEndOf(data);
  const patch: Record<string, unknown> = {
    subscribed: entitled,
    subscription_status: status,
    current_period_end: periodEnd,
    cancel_at_period_end: data.scheduledChange?.action === "cancel",
    subscription_tier: entitled ? plan?.tier ?? undefined : null,
    ...(trialEnd ? { trial_end: trialEnd } : {}),
  };
  if (externalPriceId) {
    // Plan changes arrive as subscription.updated with new items.
    patch.price_id = externalPriceId;
    if (plan?.interval) patch.billing_interval = plan.interval;
  }
  if (patch.subscription_tier === undefined) delete patch.subscription_tier;

  const { data: previous } = await db()
    .from("subscribers")
    .select("user_id, subscription_status")
    .eq("stripe_subscription_id", data.id)
    .eq("environment", env)
    .maybeSingle();

  const { data: updated } = await db()
    .from("subscribers")
    .update(patch)
    .eq("stripe_subscription_id", data.id)
    .eq("environment", env)
    .select("user_id");

  // Trial converted into a paying subscription — now the welcome/receipt mail
  // is the right message. Keyed on the subscription id, so retries are safe.
  if (previous?.subscription_status === "trialing" && status === "active") {
    const convertedUser = (previous.user_id as string | undefined) ?? userIdOf(data);
    if (convertedUser) {
      await billingEmail(
        "subscription-started",
        await emailFor(convertedUser, env),
        `trial-converted-${data.id}`,
        {
          planName: planLabel(plan?.tier, plan?.interval),
          interval: plan?.interval ?? undefined,
          nextBillingDate: formatDate(periodEnd),
        },
      );
    }
  }

  // Switching to yearly billing earns the annual bonus too (granted once per
  // subscription, so a renewal or a later change never repeats it).
  const changedUser = (updated?.[0]?.user_id as string | undefined) ?? userIdOf(data);
  if (entitled && changedUser && plan?.interval === "annual" && plan.tier) {
    await grantAnnualBonus(changedUser, String(data.id), plan.tier, env);
  }

  // Out-of-order delivery: an update can arrive before the created event.
  // Rebuild the row from the event rather than dropping the entitlement.
  if (!updated?.length && userIdOf(data)) {
    await upsertSubscription(data, env);
  }
}

/**
 * Dunning: a failed renewal marks the plan past_due, opens (or advances) the
 * recovery cycle, and tells the customer what happens next. Access is NOT
 * revoked here — Paddle keeps retrying and the watchdog escalates messaging.
 */
async function handlePaymentFailed(data: PaddleEventData, env: PaddleEnv) {
  const subscriptionId = data?.subscriptionId ?? null;
  const userId = userIdOf(data);

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

  const amountDue = Number(data?.details?.totals?.total ?? 0) || null;
  const currency = data?.currencyCode ?? "USD";
  const { attempt, nextRetryAt } = await openDunning({
    userId: target,
    environment: env,
    subscriptionId,
    amountDue,
    currency,
  });
  const exhausted = !nextRetryAt;

  // Channel choice (email / in-app / both) is the customer's, from their
  // notification preferences.
  await notifyUser({
    userId: target,
    category: "dunning",
    inApp: {
      type: "billing_payment_failed",
      title: exhausted ? "Final payment attempt failed" : "Your last payment failed",
      body: exhausted
        ? "We couldn't collect payment after several attempts. Update your card to resume your plan."
        : `Update your card to keep your plan active — we'll retry automatically (attempt ${attempt}).`,
      link: "/subscription",
      metadata: { subscription_id: subscriptionId, attempt },
    },
    email: {
      template: "payment-failed",
      recipient: await emailFor(target, env),
      idempotencyKey: `pay-failed-${data?.id ?? subscriptionId}`,
      data: {
        amount: formatMoney(amountDue, currency),
        failedAt: formatDate(data?.updatedAt ?? new Date().toISOString()),
        updatePaymentUrl: "https://app.gradr.me/subscription",
      },
    },
  });

  await recordBillingEvent({
    userId: target,
    environment: env,
    eventType: "payment_failed",
    title: exhausted ? "Final payment attempt failed" : `Payment failed (attempt ${attempt})`,
    description: exhausted
      ? "No further automatic retries. Your plan pauses unless the card is updated."
      : `We'll retry automatically${nextRetryAt ? ` on ${formatDate(nextRetryAt)}` : ""}.`,
    amountTotal: amountDue,
    currency,
    subscriptionId,
    transactionId: data?.id ?? null,
    occurredAt: data?.updatedAt ?? new Date().toISOString(),
    metadata: { attempt, next_retry_at: nextRetryAt },
  });

}

/** A completed payment clears a prior dunning state and confirms the resume. */
async function clearPaymentIssue(data: PaddleEventData, env: PaddleEnv) {
  const subscriptionId = data?.subscriptionId ?? null;
  if (!subscriptionId) return;
  const { data: recovered } = await db()
    .from("subscribers")
    .update({ subscribed: true, subscription_status: "active" })
    .eq("stripe_subscription_id", subscriptionId)
    .eq("environment", env)
    .eq("subscription_status", "past_due")
    .select("user_id");

  const wasDunning = await closeDunning({ environment: env, subscriptionId });
  const target = (recovered?.[0]?.user_id as string | undefined) ?? userIdOf(data);
  if (!target || !(wasDunning || recovered?.length)) return;

  await db().rpc("enqueue_notification", {
    _user_id: target,
    _type: "billing_payment_recovered",
    _title: "Payment received — your plan is active again",
    _body: "Thanks! Billing is back to normal and full access has resumed.",
    _link: "/subscription",
    _metadata: { subscription_id: subscriptionId },
  });

  await recordBillingEvent({
    userId: target,
    environment: env,
    eventType: "payment_recovered",
    title: "Plan resumed after successful payment",
    description: "The outstanding balance was collected and your subscription is active again.",
    subscriptionId,
    transactionId: data?.id ?? null,
  });
}


/**
 * Eligibility discounts: record what was actually redeemed, and re-check that
 * the buyer was entitled to it. A discounted transaction from someone with no
 * verified eligibility is logged as a denied security event so it can be
 * investigated — the sale is never blocked after the fact.
 */
async function recordDiscountUse(data: PaddleEventData, env: PaddleEnv) {
  const userId = userIdOf(data);
  const discountAmount = Number(data?.details?.totals?.discount ?? 0);
  if (!userId || !data?.id || discountAmount <= 0) return;

  const item = data.items?.[0];
  const externalPriceId = priceExternalId(item);
  const plan = externalPriceId ? PLAN_PRICES[externalPriceId] : undefined;

  const { data: entitled } = await db().rpc("best_discount_for", {
    _user_id: userId,
    _plan: plan?.tier ?? null,
    _interval: plan?.interval ?? null,
  });
  const resolved = (entitled ?? {}) as { percentage?: number; rule_id?: string; eligibility_type?: string };

  const subtotal = Number(data?.details?.totals?.subtotal ?? 0);
  const grandTotal = Number(data?.details?.totals?.grandTotal ?? data?.details?.totals?.total ?? 0);
  const appliedPercent = subtotal > 0 ? Math.round((discountAmount / subtotal) * 10000) / 100 : 0;

  await db().rpc("record_discount_redemption", {
    _user_id: userId,
    _rule_id: resolved.rule_id ?? null,
    _eligibility_type: resolved.eligibility_type ?? null,
    _percentage: appliedPercent,
    _plan: plan?.tier ?? null,
    _interval: plan?.interval ?? null,
    _env: env,
    _transaction_id: String(data.id),
    _subscription_id: data.subscriptionId ?? null,
    _gross: subtotal / 100,
    _discount: discountAmount / 100,
    _net: grandTotal / 100,
    _currency: (data.currencyCode ?? "usd").toLowerCase(),
  });

  const legitimate = Number(resolved.percentage ?? 0) > 0;
  await logSecurityEvent({
    category: "discount",
    event: "discount_redeemed",
    decision: legitimate ? "allowed" : "denied",
    userId,
    env,
    source: "payments-webhook",
    reason: legitimate ? null : "discount_applied_without_verified_eligibility",
    details: {
      transaction_id: String(data.id),
      applied_percent: appliedPercent,
      entitled_percent: resolved.percentage ?? 0,
      paddle_discount_id: data.discountId ?? null,
    },
  });
}

/**
 * Affiliate attribution. Idempotent by Paddle transaction id: the RPC refuses to
 * create a second commission for the same source record, so webhook retries and
 * duplicate deliveries can never double-pay.
 */
async function recordAffiliateCommission(data: PaddleEventData, env: PaddleEnv) {
  const userId = userIdOf(data);
  if (!userId || !data?.id) return;

  // Commission basis is configurable: 'net' pays on what the customer actually
  // paid after an eligibility discount, 'gross' pays on the list price.
  const { data: settings } = await db()
    .from("discount_settings")
    .select("affiliate_commission_basis")
    .eq("id", 1)
    .maybeSingle();

  const grandTotal = Number(data?.details?.totals?.grandTotal ?? data?.details?.totals?.total ?? 0);
  const subtotal = Number(data?.details?.totals?.subtotal ?? 0);
  const basisTotal = settings?.affiliate_commission_basis === "gross" && subtotal > 0
    ? subtotal
    : grandTotal;
  // Paddle reports minor units (cents).
  const amount = basisTotal > 0 ? basisTotal / 100 : 0;
  if (amount <= 0) return;

  const { data: commissionId, error } = await db().rpc("record_conversion_commission", {
    _referred_user_id: userId,
    _source_amount: amount,
    _conversion_type: "paid_upgrade",
    _source_record_id: String(data.id),
  });

  if (error) {
    console.error("affiliate commission failed", error.message);
    return;
  }
  if (commissionId) {
    await logSecurityEvent({
      category: "affiliate",
      event: "commission_recorded",
      decision: "allowed",
      userId,
      env,
      source: "payments-webhook",
      details: { commission_id: commissionId, amount, transaction_id: data.id },
    });
  }
}

/** Refunds, chargebacks and cancellations reverse the matching commission. */
async function reverseAffiliateCommission(data: PaddleEventData, env: PaddleEnv, reason: string) {
  const sourceId = data?.transactionId ?? data?.id;
  if (!sourceId) return;
  const { data: count, error } = await db().rpc("reverse_commission_for_source", {
    _source_record_id: String(sourceId),
    _reason: reason,
  });
  if (error) {
    console.error("affiliate reversal failed", error.message);
    return;
  }
  if (Number(count ?? 0) > 0) {
    await logSecurityEvent({
      category: "affiliate",
      event: "commission_reversed",
      decision: "allowed",
      userId: userIdOf(data),
      env,
      source: "payments-webhook",
      details: { reversed: count, reason, source_record_id: String(sourceId) },
    });
  }
}



/**
 * Annual-plan bonus credits. Idempotent: the grant is recorded in `purchases`
 * under a synthetic id derived from the subscription, so webhook retries and
 * renewals of the same subscription never grant twice.
 */
async function grantAnnualBonus(
  userId: string,
  subscriptionId: string,
  tier: "starter" | "pro" | "advanced",
  env: PaddleEnv,
) {
  const bonus = ANNUAL_BONUS[tier];
  if (!bonus) return;
  const grantId = `annual-bonus-${subscriptionId}`;

  const { data: existing } = await db()
    .from("purchases")
    .select("id")
    .eq("stripe_session_id", grantId)
    .eq("environment", env)
    .maybeSingle();
  if (existing) return;

  await db().from("purchases").insert({
    user_id: userId,
    stripe_session_id: grantId,
    environment: env,
    pack_key: "annual_bonus",
    pack_label: `Annual plan bonus (${tier})`,
    quantity: 1,
    credits_granted: bonus.application + bonus.interview,
    amount_total: 0,
    currency: "usd",
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
      application_credits: Number(current?.application_credits ?? 0) + bonus.application,
      interview_credits: Number(current?.interview_credits ?? 0) + bonus.interview,
    },
    { onConflict: "user_id,environment" },
  );

  await db().rpc("enqueue_notification", {
    _user_id: userId,
    _type: "credits_bonus",
    _title: "Annual plan bonus credits added",
    _body: `${bonus.application} extra application credits and ${bonus.interview} interview credits are in your account.`,
    _link: "/credits",
    _metadata: { subscription_id: subscriptionId, tier },
  });

  await recordBillingEvent({
    userId,
    environment: env,
    eventType: "credits_granted",
    title: "Annual plan bonus credits",
    description: `${bonus.application} application + ${bonus.interview} interview credits for choosing yearly billing.`,
    subscriptionId,
    metadata: { tier, ...bonus },
  });
}

/** One-off credit packs are granted from completed transactions. */
async function grantPackCredits(data: PaddleEventData, env: PaddleEnv) {
  const userId = userIdOf(data);
  if (!userId) return;

  for (const item of data.items ?? []) {
    const priceId = priceExternalId(item);
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

    const appAfter = Number(current?.application_credits ?? 0) +
      (pack.kind === "application" ? credits : 0);
    const intAfter = Number(current?.interview_credits ?? 0) +
      (pack.kind === "interview" ? credits : 0);

    await db().from("usage_credits").upsert(
      {
        user_id: userId,
        environment: env,
        application_credits: appAfter,
        interview_credits: intAfter,
      },
      { onConflict: "user_id,environment" },
    );

    // Ledger the grant so a later refund reversal has a matching counterpart.
    await recordLedgerEntry({
      userId,
      environment: env,
      entryType: "grant",
      feature: pack.kind === "interview" ? "interview_credits" : "application_credits",
      delta: credits,
      balanceAfter: pack.kind === "interview" ? intAfter : appAfter,
      reason: `Credit pack purchase: ${pack.label}`,
      providerEventId: `pack:${data.id}`,
      transactionId: data.id ?? null,
      amount: Number(data.details?.totals?.total ?? 0) || null,
      currency: data.currencyCode ?? "usd",
      metadata: { pack_key: priceId, quantity },
    });
  }
}


/**
 * Refunds and chargebacks: reverse the entitlements the transaction granted,
 * write the ledger entries, and tell the customer what changed.
 */
async function handleAdjustment(data: PaddleEventData, env: PaddleEnv, providerEventId: string | null) {
  const outcome = await reverseEntitlementsForAdjustment(data, env, providerEventId);
  if (!outcome.userId) {
    console.warn("adjustment could not be attributed to a user", {
      transaction_id: outcome.transactionId,
    });
    return;
  }

  const action = String(data?.action ?? "refund");
  const money = formatMoney(outcome.amount, (outcome.currency ?? "usd").toUpperCase());
  const creditsLine = outcome.reversedCredits
    .map((c) => `${Math.abs(c.delta)} ${c.feature.replace("_credits", "")} credits`)
    .join(", ");

  const description = [
    outcome.subscriptionRevoked ? "Plan access has ended." : null,
    creditsLine ? `${creditsLine} were removed.` : null,
  ].filter(Boolean).join(" ") || "No entitlements needed reversing.";

  await recordBillingEvent({
    userId: outcome.userId,
    environment: env,
    eventType: action === "chargeback" ? "chargeback" : "refund",
    title: action === "chargeback" ? `Chargeback — ${money}` : `Refund issued — ${money}`,
    description,
    amountTotal: outcome.amount,
    currency: outcome.currency,
    transactionId: outcome.transactionId,
    occurredAt: data?.createdAt ?? null,
    metadata: {
      action,
      reversed_credits: outcome.reversedCredits,
      subscription_revoked: outcome.subscriptionRevoked,
    },
  });

  await notifyUser({
    userId: outcome.userId,
    category: "refund",
    inApp: {
      type: "billing_refund",
      title: action === "chargeback" ? "Payment reversed" : "Refund processed",
      body: `${money} — ${description}`,
      link: "/billing",
      metadata: { transaction_id: outcome.transactionId, action },
    },
    email: {
      template: "payment-refunded",
      recipient: await emailFor(outcome.userId, env),
      idempotencyKey: `refund-${outcome.transactionId ?? providerEventId}`,
      data: {
        amount: money,
        refundedAt: formatDate(data?.createdAt ?? new Date().toISOString()),
        summary: description,
        billingUrl: "https://app.gradr.me/billing",
      },
    },
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const env = (new URL(req.url).searchParams.get("env") || "sandbox") as PaddleEnv;

  // Delivery ledger id, so a handler failure can be retried/reconciled later.
  let deliveryEventId: string | null = null;

  try {
    // Internal replay: the watchdog re-runs a stored payload for a delivery
    // that failed. It authenticates with the cron secret instead of a Paddle
    // signature, and can only ever replay a payload we already persisted.
    const replaySecret = req.headers.get("x-internal-replay");
    const cronSecret = Deno.env.get("CRON_SECRET");
    const isReplay = Boolean(replaySecret && cronSecret && replaySecret === cronSecret);

    const event = (isReplay
      ? await (async () => {
        const body = await req.json();
        return { eventType: body.eventType, data: body.data, eventId: body.eventId };
      })()
      : await verifyWebhook(req, env)) as unknown as PaddleWebhookEvent;
    const eventUserId = userIdOf(event.data as PaddleEventData) ?? null;

    deliveryEventId = event.eventId ?? null;

    if (deliveryEventId) {
      await db().from("webhook_deliveries").upsert(
        {
          provider: "paddle",
          event_id: deliveryEventId,
          event_type: String(event.eventType),
          environment: env,
          signature_verified: true,
          state: "processing",
          payload: event.data as unknown as Record<string, unknown>,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "event_id" },
      );
    }



    await logSecurityEvent({
      category: "billing_webhook",
      event: String(event.eventType),
      decision: "received",
      userId: eventUserId,
      env,
      source: "payments-webhook",
      details: {
        event_id: event.eventId ?? null,
        status: event.data?.status ?? null,
        customer_id: event.data?.customerId ?? event.data?.id ?? null,
        subscription_id: event.data?.subscriptionId ?? null,
      },
    });

    switch (event.eventType) {
      case EventName.SubscriptionCreated: {
        await mirrorSubscription(event.data, env);
        await upsertSubscription(event.data, env);
        const created = planFromItems(event.data);
        const revenueProps = {
          plan: created.plan?.tier ?? "unknown",
          billing_period: created.plan?.interval ?? "unknown",
          environment: env,
          amount: Number(event.data?.items?.[0]?.price?.unitPrice?.amount ?? 0) / 100,
          currency: event.data?.currencyCode ?? null,
        };
        // Ledgered against the Paddle event id so a missing or duplicated
        // conversion event is detectable, not just invisible.
        const analyticsCtx = { providerEventId: deliveryEventId, source: "payments-webhook", environment: env };
        await phCapture("subscription_created", eventUserId, revenueProps, analyticsCtx);
        await phCapture("payment_completed", eventUserId, revenueProps, analyticsCtx);
        await phCapture("upgraded_to_premium", eventUserId, revenueProps, analyticsCtx);
        await phSetPerson(eventUserId, {
          plan: created.plan?.tier ?? "unknown",
          billing_period: created.plan?.interval ?? "unknown",
          is_paying: true,
          subscription_status: "active",
        });
        await recordBillingEvent({
          userId: eventUserId,
          environment: env,
          eventType: "subscription_started",
          title: `${planLabel(created.plan?.tier, created.plan?.interval)} started`,
          description: "Your subscription is active.",
          subscriptionId: event.data?.id ?? null,
          occurredAt: event.data?.createdAt ?? null,
        });
        break;
      }
      case EventName.SubscriptionUpdated: {
        // A scheduled cancellation is NOT a cancellation: we mirror the
        // scheduled change but keep the status Paddle reports.
        await mirrorSubscription(event.data, env);
        await updateSubscription(event.data, env);
        const updatedData = event.data;
        const updatedPlan = planFromItems(updatedData).plan;
        const scheduled = updatedData?.scheduledChange?.action ?? null;
        await recordBillingEvent({
          userId: eventUserId,
          environment: env,
          eventType: scheduled ? `subscription_${scheduled}_scheduled` : "subscription_updated",
          title: scheduled === "cancel"
            ? "Cancellation scheduled"
            : scheduled === "pause"
              ? "Pause scheduled"
              : `Subscription updated — ${updatedData?.status ?? "active"}`,
          description: scheduled
            ? `Takes effect ${formatDate(updatedData?.scheduledChange?.effectiveAt)}.`
            : planLabel(updatedPlan?.tier, updatedPlan?.interval),
          subscriptionId: updatedData?.id ?? null,
          occurredAt: updatedData?.updatedAt ?? null,
          metadata: { status: updatedData?.status ?? null, scheduled_change: scheduled },
        });
        break;
      }

      case EventName.SubscriptionCanceled: {
        await mirrorSubscription({ ...event.data, status: "canceled" }, env);
        await updateSubscription({ ...event.data, status: "canceled" }, env);
        const canceled = planFromItems(event.data);
        await phCapture("subscription_cancelled", eventUserId, {
          plan: canceled.plan?.tier ?? "unknown",
          billing_period: canceled.plan?.interval ?? "unknown",
          environment: env,
        }, { providerEventId: deliveryEventId, source: "payments-webhook", environment: env });
        await phSetPerson(eventUserId, { is_paying: false, subscription_status: "canceled" });
        if (eventUserId) {
          const cancelData = event.data;
          await db().rpc("enqueue_notification", {
            _user_id: eventUserId,
            _type: "billing_subscription_cancelled",
            _title: "Your subscription was cancelled",
            _body: "You keep full access until the end of the paid period.",
            _link: "/billing",
            _metadata: { subscription_id: cancelData?.id ?? null },
          });
          // Keyed on the subscription id so Paddle retries never re-send it.
          const cancelledInTrial = Boolean(cancelData?.status === "trialing") ||
            (Boolean(trialEndOf(cancelData)) &&
              new Date(trialEndOf(cancelData) as string) > new Date());
          await billingEmail(
            cancelledInTrial ? "trial-cancelled" : "subscription-cancelled",
            await emailFor(eventUserId, env),
            `sub-cancelled-${cancelData?.id}`,
            {
              planName: planLabel(canceled.plan?.tier, canceled.plan?.interval),
              cancelledAt: formatDate(cancelData?.canceledAt ?? new Date().toISOString()),
              accessUntil: formatDate(cancelData?.currentBillingPeriod?.endsAt),
            },
          );
          await recordBillingEvent({
            userId: eventUserId,
            environment: env,
            eventType: "subscription_cancelled",
            title: "Subscription cancelled",
            description: cancelData?.currentBillingPeriod?.endsAt
              ? `Access continues until ${formatDate(cancelData.currentBillingPeriod.endsAt)}.`
              : "Access ends at the close of the paid period.",
            subscriptionId: cancelData?.id ?? null,
            occurredAt: cancelData?.canceledAt ?? null,
          });
        }
        break;
      }

      case EventName.CustomerCreated:
      case EventName.CustomerUpdated:
        await mirrorCustomer(event.data, env);
        break;
      case EventName.TransactionCompleted: {
        await clearPaymentIssue(event.data, env);
        await grantPackCredits(event.data, env);
        await recordDiscountUse(event.data, env);
        await recordAffiliateCommission(event.data, env);
        await phCapture("payment_completed", eventUserId, {
          environment: env,
          amount: Number(event.data?.details?.totals?.grandTotal ?? 0) / 100,
          currency: event.data?.currencyCode ?? null,
          product_type: event.data?.subscriptionId ? "subscription" : "pack",
        }, { providerEventId: deliveryEventId, source: "payments-webhook", environment: env });

        // Receipt for every successful charge — subscription renewals and
        // one-off credit packs alike. Idempotent on the transaction id.
        const txn = event.data;
        const paidTotal = Number(txn?.details?.totals?.grandTotal ?? txn?.details?.totals?.total ?? 0);
        if (eventUserId && paidTotal > 0) {
          const paidPlan = planFromItems(txn).plan;
          const packKey = priceExternalId(txn?.items?.[0]);
          const pack = packKey ? CREDIT_PACKS[packKey] : undefined;
          await billingEmail("payment-successful", await emailFor(eventUserId, env), `txn-paid-${txn?.id}`, {
            planName: pack?.label ?? planLabel(paidPlan?.tier, paidPlan?.interval),
            interval: pack ? "one-time" : paidPlan?.interval ?? undefined,
            amount: formatMoney(paidTotal, txn?.currencyCode ?? "USD"),
            paidAt: formatDate(txn?.billedAt ?? txn?.createdAt ?? new Date().toISOString()),
            nextBillingDate: formatDate(txn?.billingPeriod?.endsAt),
          });
          await recordBillingEvent({
            userId: eventUserId,
            environment: env,
            eventType: txn?.subscriptionId ? "invoice_paid" : "pack_purchased",
            title: pack?.label
              ? `${pack.label} purchased`
              : `Payment received — ${planLabel(paidPlan?.tier, paidPlan?.interval)}`,
            description: txn?.billingPeriod?.endsAt
              ? `Covers billing period ending ${formatDate(txn.billingPeriod.endsAt)}.`
              : "One-off purchase.",
            amountTotal: paidTotal,
            currency: txn?.currencyCode ?? "usd",
            subscriptionId: txn?.subscriptionId ?? null,
            transactionId: txn?.id ?? null,
            occurredAt: txn?.billedAt ?? txn?.createdAt ?? null,
            metadata: { invoice_number: txn?.invoiceNumber ?? null },
          });
        }

        break;
      }
      case EventName.TransactionPaymentFailed:
        await handlePaymentFailed(event.data, env);
        break;
      case EventName.AdjustmentCreated: {
        // Refunds / chargebacks arrive as adjustments against a transaction.
        await reverseAffiliateCommission(event.data, env, "refund_adjustment");
        await handleAdjustment(event.data, env, deliveryEventId);
        break;
      }


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

    if (deliveryEventId) {
      await db().from("webhook_deliveries").update({
        state: "processed",
        processed_at: new Date().toISOString(),
        last_error: null,
        updated_at: new Date().toISOString(),
      }).eq("event_id", deliveryEventId);
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Webhook error:", e);
    const message = e instanceof Error ? e.message : String(e);
    await logSecurityEvent({
      category: "billing_webhook",
      event: "verification_or_handler_error",
      decision: "failed",
      env,
      source: "payments-webhook",
      reason: message,
    });
    if (deliveryEventId) {
      // Left in `failed` for payments-reconcile to repair from the Paddle API.
      const { data: row } = await db()
        .from("webhook_deliveries")
        .select("attempts")
        .eq("event_id", deliveryEventId)
        .maybeSingle();
      await db().from("webhook_deliveries").update({
        state: "failed",
        last_error: message.slice(0, 500),
        attempts: Number(row?.attempts ?? 0) + 1,
        updated_at: new Date().toISOString(),
      }).eq("event_id", deliveryEventId);
    }
    // Non-2xx makes Paddle retry the delivery on its own schedule.
    return new Response("Webhook error", { status: 400 });
  }

});
