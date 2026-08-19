/**
 * Entitlement ledger + channel-aware customer messaging.
 *
 * Every credit or plan entitlement movement is appended to
 * `entitlement_ledger` — grants when a purchase lands, reversals when Paddle
 * issues a refund or chargeback. The ledger is the audit trail: balances in
 * `usage_credits` / `subscribers` are derived state that can be rebuilt, the
 * ledger is what explains how they got there.
 *
 * `notifyUser` is the single place that decides whether a billing message goes
 * out as email, in-app, both or neither, based on the user's
 * `notification_preferences` row.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { sendTransactionalEmail } from "./sendTransactional.ts";

let _client: ReturnType<typeof createClient> | null = null;
function db() {
  if (!_client) {
    _client = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );
  }
  return _client;
}

export type LedgerEntryType = "grant" | "reversal" | "adjustment";
/** `subscription` tracks plan access; the others track consumable credits. */
export type LedgerFeature = "application_credits" | "interview_credits" | "subscription";

export interface LedgerEntry {
  userId: string;
  environment: string;
  entryType: LedgerEntryType;
  feature: LedgerFeature;
  delta: number;
  balanceAfter?: number | null;
  reason?: string | null;
  source?: string;
  providerEventId?: string | null;
  transactionId?: string | null;
  subscriptionId?: string | null;
  amount?: number | null;
  currency?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Appends one ledger row. Idempotent per (provider event, feature, type) so a
 * webhook replay never double-counts. Best-effort: never fails the caller.
 */
export async function recordLedgerEntry(entry: LedgerEntry): Promise<boolean> {
  if (!entry.userId) return false;
  try {
    const { error } = await db().from("entitlement_ledger").upsert(
      {
        user_id: entry.userId,
        environment: entry.environment,
        entry_type: entry.entryType,
        feature: entry.feature,
        delta: Math.trunc(entry.delta),
        balance_after: entry.balanceAfter ?? null,
        reason: entry.reason ?? null,
        source: entry.source ?? "payments-webhook",
        provider_event_id: entry.providerEventId ?? null,
        transaction_id: entry.transactionId ?? null,
        subscription_id: entry.subscriptionId ?? null,
        amount: entry.amount ?? null,
        currency: (entry.currency ?? null)?.toLowerCase() ?? null,
        metadata: entry.metadata ?? {},
      },
      { onConflict: "provider_event_id,feature,entry_type", ignoreDuplicates: true },
    );
    if (error) {
      console.error("recordLedgerEntry failed", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error("recordLedgerEntry threw", String(err));
    return false;
  }
}

export type NotifyCategory = "dunning" | "renewal" | "webhook_issue" | "refund";

interface Channels {
  email: boolean;
  in_app: boolean;
}

/** Defaults are permissive so a missing preferences row never silences billing. */
export async function channelsFor(userId: string, category: NotifyCategory): Promise<Channels> {
  try {
    const { data } = await db().rpc("notification_channels", { _user_id: userId, _category: category });
    const parsed = data as unknown as Channels | null;
    if (parsed && typeof parsed.email === "boolean") return parsed;
  } catch (err) {
    console.error("channelsFor failed", String(err));
  }
  return { email: category !== "webhook_issue", in_app: true };
}

export interface NotifyInput {
  userId: string;
  category: NotifyCategory;
  inApp: {
    type: string;
    title: string;
    body: string;
    link?: string;
    metadata?: Record<string, unknown>;
  };
  email?: {
    template: string;
    recipient: string | null | undefined;
    idempotencyKey: string;
    data: Record<string, unknown>;
  };
}

/** Sends a billing message on exactly the channels the user opted into. */
export async function notifyUser(input: NotifyInput): Promise<Channels> {
  const channels = await channelsFor(input.userId, input.category);

  if (channels.in_app) {
    await db().rpc("enqueue_notification", {
      _user_id: input.userId,
      _type: input.inApp.type,
      _title: input.inApp.title,
      _body: input.inApp.body,
      _link: input.inApp.link ?? "/billing",
      _metadata: input.inApp.metadata ?? {},
    }).then(({ error }) => {
      if (error) console.error("enqueue_notification failed", error.message);
    });
  }

  if (
    channels.email && input.email?.recipient &&
    input.email.recipient !== "unknown@gradr.local"
  ) {
    await sendTransactionalEmail({
      templateName: input.email.template,
      recipientEmail: input.email.recipient,
      idempotencyKey: input.email.idempotencyKey,
      templateData: input.email.data,
    });
  }

  return channels;
}

/** ---- Refund / chargeback reversal ---------------------------------------- */

export interface RefundResult {
  ok: boolean;
  reason: string;
  userId?: string | null;
  transactionId?: string | null;
  reversedCredits: { feature: LedgerFeature; delta: number; balanceAfter: number }[];
  subscriptionRevoked: boolean;
  amount?: number | null;
  currency?: string | null;
}

/**
 * Reverses entitlements for a refunded / charged-back transaction.
 *
 * Credit packs: the granted credits are clawed back, clamped at zero — a user
 * who already spent them ends at 0 rather than going negative, and the ledger
 * records the shortfall so support can see it.
 *
 * Subscriptions: a full refund revokes access immediately; a partial refund
 * (a credit or proration) leaves access alone and records the money movement
 * only, because the customer still paid for the period.
 */
// deno-lint-ignore no-explicit-any
export async function reverseEntitlementsForAdjustment(
  adjustment: any,
  env: string,
  providerEventId?: string | null,
): Promise<RefundResult> {
  const result: RefundResult = {
    ok: false,
    reason: "no_transaction",
    reversedCredits: [],
    subscriptionRevoked: false,
  };

  const transactionId: string | null = adjustment?.transactionId ?? adjustment?.transaction_id ?? null;
  const action: string = String(adjustment?.action ?? "refund");
  const amountRaw = adjustment?.totals?.total ?? adjustment?.payoutTotals?.total ?? null;
  const amount = amountRaw != null ? Number(amountRaw) : null;
  const currency: string = adjustment?.currencyCode ?? adjustment?.currency_code ?? "usd";
  result.transactionId = transactionId;
  result.amount = amount;
  result.currency = currency;

  if (!transactionId) return result;

  // The purchase row is the record of what the transaction actually granted.
  const { data: purchase } = await db()
    .from("purchases")
    .select("id, user_id, pack_key, pack_label, credits_granted, amount_total, status")
    .eq("stripe_session_id", transactionId)
    .eq("environment", env)
    .maybeSingle();

  let userId = (purchase?.user_id as string | undefined) ?? adjustment?.customData?.userId ?? null;
  const subscriptionId: string | null = adjustment?.subscriptionId ?? adjustment?.subscription_id ?? null;

  if (!userId && subscriptionId) {
    const { data: sub } = await db()
      .from("paddle_subscriptions")
      .select("user_id")
      .eq("subscription_id", subscriptionId)
      .maybeSingle();
    userId = (sub?.user_id as string | undefined) ?? null;
  }

  if (!userId) {
    result.reason = "user_not_found";
    return result;
  }
  result.userId = userId;

  // 1. Credit pack refund — claw back what the pack granted.
  if (purchase?.credits_granted && purchase.pack_key) {
    const isInterview = String(purchase.pack_key).startsWith("interview");
    const feature: LedgerFeature = isInterview ? "interview_credits" : "application_credits";
    const column = isInterview ? "interview_credits" : "application_credits";
    const granted = Number(purchase.credits_granted ?? 0);

    const { data: balances } = await db()
      .from("usage_credits")
      .select("application_credits, interview_credits")
      .eq("user_id", userId)
      .eq("environment", env)
      .maybeSingle();

    const current = Number((balances as Record<string, unknown> | null)?.[column] ?? 0);
    const removed = Math.min(current, granted);
    const balanceAfter = current - removed;

    await db().from("usage_credits").upsert(
      {
        user_id: userId,
        environment: env,
        application_credits: isInterview
          ? Number(balances?.application_credits ?? 0)
          : balanceAfter,
        interview_credits: isInterview
          ? balanceAfter
          : Number(balances?.interview_credits ?? 0),
      },
      { onConflict: "user_id,environment" },
    );

    await db().from("purchases")
      .update({ status: action === "chargeback" ? "charged_back" : "refunded" })
      .eq("id", purchase.id);

    await recordLedgerEntry({
      userId,
      environment: env,
      entryType: "reversal",
      feature,
      delta: -removed,
      balanceAfter,
      reason: `${action}: ${purchase.pack_label ?? purchase.pack_key}`,
      providerEventId: providerEventId ?? null,
      transactionId,
      amount,
      currency,
      metadata: {
        pack_key: purchase.pack_key,
        credits_granted: granted,
        // Already-spent credits can't be clawed back; surfaced for support.
        shortfall: granted - removed,
        action,
      },
    });

    result.reversedCredits.push({ feature, delta: -removed, balanceAfter });
  }

  // 2. Subscription refund — a full refund ends access now.
  if (subscriptionId && !purchase?.pack_key) {
    const isFull = action === "refund" || action === "chargeback";
    if (isFull) {
      await db().from("subscribers")
        .update({
          subscribed: false,
          subscription_status: action === "chargeback" ? "charged_back" : "refunded",
        })
        .eq("user_id", userId)
        .eq("environment", env);

      await db().from("paddle_subscriptions")
        .update({ status: "refunded", updated_at: new Date().toISOString() })
        .eq("subscription_id", subscriptionId);

      result.subscriptionRevoked = true;
    }

    await recordLedgerEntry({
      userId,
      environment: env,
      entryType: "reversal",
      feature: "subscription",
      delta: isFull ? -1 : 0,
      reason: `${action} on subscription`,
      providerEventId: providerEventId ?? null,
      transactionId,
      subscriptionId,
      amount,
      currency,
      metadata: { action, access_revoked: isFull },
    });
  }

  result.ok = result.reversedCredits.length > 0 || result.subscriptionRevoked ||
    Boolean(subscriptionId);
  result.reason = result.ok ? action : "nothing_to_reverse";
  return result;
}
