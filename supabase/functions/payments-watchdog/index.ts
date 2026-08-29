/**
 * Payments watchdog.
 *
 * Runs on a schedule (and on demand from the admin UI) to make sure no payment
 * ever gets stuck silently:
 *
 *  1. Retry queue — failed webhook deliveries are replayed from their stored
 *     payload with exponential backoff.
 *  2. Delayed entitlements — a processed purchase event with no resulting
 *     subscriber/credit row is escalated.
 *  3. Dunning — advances the failed-payment recovery schedule and sends the
 *     retry / final-notice messaging.
 *  4. Alerts — dedupe-keyed admin notifications, email and Slack.
 *
 * Auth: `x-cron-secret` matching CRON_SECRET, or a signed-in admin.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { formatDate, formatMoney, sendTransactionalEmail } from "../_shared/sendTransactional.ts";
import { DUNNING_MAX_ATTEMPTS, nextDunningRetry } from "../_shared/billingLedger.ts";
import { gatewayFetch, resolvePaddlePriceId, type PaddleEnv } from "../_shared/paddle.ts";

const MAX_REPLAY_ATTEMPTS = 5;
/** Backoff per attempt, in minutes. */
const REPLAY_BACKOFF_MINUTES = [2, 10, 30, 120, 360];
/** A purchase event that hasn't produced entitlements after this is a problem. */
const ENTITLEMENT_SLA_MINUTES = 10;

function admin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/** Raises an alert once per dedupe key, then fans it out to the team. */
async function raiseAlert(params: {
  alertType: string;
  severity: "warning" | "critical";
  environment: string;
  subject: string;
  dedupeKey: string;
  details: Record<string, unknown>;
}): Promise<boolean> {
  const db = admin();
  const { data: existing } = await db
    .from("billing_alerts")
    .select("id, notified_at")
    .eq("dedupe_key", params.dedupeKey)
    .maybeSingle();

  await db.from("billing_alerts").upsert(
    {
      ...(existing ? { id: existing.id } : {}),
      alert_type: params.alertType,
      severity: params.severity,
      environment: params.environment,
      subject: params.subject,
      dedupe_key: params.dedupeKey,
      details: params.details,
      notified_at: existing?.notified_at ?? new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "dedupe_key" },
  );

  // Already told the team about this exact problem — don't spam.
  if (existing?.notified_at) return false;

  await db.rpc("notify_admins", {
    _type: "billing_alert",
    _title: params.subject,
    _body: `${params.severity.toUpperCase()} · ${params.alertType} (${params.environment})`,
    _link: "/admin/webhook-logs",
    _metadata: params.details,
  });

  const alertEmail = Deno.env.get("ALERT_EMAIL_TO");
  if (alertEmail) {
    await sendTransactionalEmail({
      templateName: "security-alert",
      recipientEmail: alertEmail,
      idempotencyKey: `billing-alert-${params.dedupeKey}`,
      templateData: {
        alertType: params.alertType,
        headline: params.subject,
        detail: JSON.stringify(params.details).slice(0, 800),
        occurredAt: formatDate(new Date().toISOString()),
      },
    });
  }

  const slack = Deno.env.get("ALERT_SLACK_WEBHOOK_URL");
  if (slack) {
    await fetch(slack, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: `:rotating_light: *${params.subject}*\n${params.alertType} · ${params.environment}\n\`\`\`${
          JSON.stringify(params.details).slice(0, 800)
        }\`\`\``,
      }),
    }).catch((err) => console.error("slack alert failed", String(err)));
  }
  return true;
}

/** 1. Replay failed webhook deliveries from their stored payload. */
async function runRetryQueue(): Promise<{ retried: number; recovered: number; exhausted: number }> {
  const db = admin();
  const nowIso = new Date().toISOString();
  const { data: failures } = await db
    .from("webhook_deliveries")
    .select("id, event_id, event_type, environment, payload, attempts, next_retry_at")
    .eq("provider", "paddle")
    .eq("state", "failed")
    .lt("attempts", MAX_REPLAY_ATTEMPTS)
    .or(`next_retry_at.is.null,next_retry_at.lte.${nowIso}`)
    .order("updated_at", { ascending: true })
    .limit(20);

  let retried = 0;
  let recovered = 0;
  let exhausted = 0;
  const cronSecret = Deno.env.get("CRON_SECRET") ?? "";
  const base = Deno.env.get("SUPABASE_URL");

  for (const row of failures ?? []) {
    if (!row.payload || !row.event_type) continue;
    retried += 1;

    const res = await fetch(
      `${base}/functions/v1/payments-webhook?env=${row.environment ?? "sandbox"}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-internal-replay": cronSecret,
          apikey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({
          eventType: row.event_type,
          eventId: row.event_id,
          data: row.payload,
        }),
      },
    ).catch((err) => {
      console.error("replay request failed", String(err));
      return null;
    });

    if (res?.ok) {
      recovered += 1;
      await db.from("webhook_deliveries").update({
        replays: 1,
        next_retry_at: null,
        updated_at: new Date().toISOString(),
      }).eq("id", row.id);
      continue;
    }

    const attempts = Number(row.attempts ?? 0) + 1;
    const backoff = REPLAY_BACKOFF_MINUTES[Math.min(attempts, REPLAY_BACKOFF_MINUTES.length) - 1];
    await db.from("webhook_deliveries").update({
      attempts,
      next_retry_at: attempts >= MAX_REPLAY_ATTEMPTS
        ? null
        : new Date(Date.now() + backoff * 60_000).toISOString(),
      last_error: `replay failed (${res?.status ?? "network"})`,
      updated_at: new Date().toISOString(),
    }).eq("id", row.id);

    if (attempts >= MAX_REPLAY_ATTEMPTS) {
      exhausted += 1;
      await raiseAlert({
        alertType: "webhook_replay_exhausted",
        severity: "critical",
        environment: String(row.environment ?? "sandbox"),
        subject: `Payment webhook could not be processed: ${row.event_type}`,
        dedupeKey: `replay-exhausted-${row.event_id}`,
        details: { event_id: row.event_id, event_type: row.event_type, attempts },
      });
    }
  }

  return { retried, recovered, exhausted };
}

/**
 * Manual re-trigger of one stored delivery, used by the billing ops console.
 * Unlike the queue sweep this ignores backoff and attempt limits — an operator
 * asking for a replay has already decided it's worth another try.
 */
async function replayDelivery(
  deliveryId: string,
): Promise<{ ok: boolean; status?: number; error?: string }> {
  if (!deliveryId) return { ok: false, error: "missing_delivery_id" };
  const db = admin();
  const { data: row } = await db
    .from("webhook_deliveries")
    .select("id, event_id, event_type, environment, payload, attempts")
    .eq("id", deliveryId)
    .maybeSingle();

  if (!row?.payload || !row.event_type) return { ok: false, error: "delivery_not_replayable" };

  const res = await fetch(
    `${Deno.env.get("SUPABASE_URL")}/functions/v1/payments-webhook?env=${row.environment ?? "sandbox"}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-replay": Deno.env.get("CRON_SECRET") ?? "",
        apikey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      },
      body: JSON.stringify({ eventType: row.event_type, eventId: row.event_id, data: row.payload }),
    },
  ).catch(() => null);

  await db.from("webhook_deliveries").update({
    replays: Number(row.attempts ?? 0) > 0 ? Number(row.attempts) : 1,
    state: res?.ok ? "processed" : "failed",
    last_error: res?.ok ? null : `manual replay failed (${res?.status ?? "network"})`,
    next_retry_at: null,
    updated_at: new Date().toISOString(),
  }).eq("id", row.id);

  return res?.ok ? { ok: true, status: res.status } : { ok: false, status: res?.status, error: "replay_failed" };
}



/** 2. Purchases that were accepted but never produced entitlements. */
async function checkDelayedEntitlements(): Promise<number> {
  const db = admin();
  const cutoff = new Date(Date.now() - ENTITLEMENT_SLA_MINUTES * 60_000).toISOString();

  const { data: rows } = await db
    .from("webhook_deliveries")
    .select("id, event_id, event_type, environment, payload, processed_at, alerted_at")
    .eq("provider", "paddle")
    .eq("state", "processed")
    .is("alerted_at", null)
    .in("event_type", ["subscription.created", "transaction.completed"])
    .lt("processed_at", cutoff)
    .order("processed_at", { ascending: false })
    .limit(50);

  let flagged = 0;
  for (const row of rows ?? []) {
    const payload = (row.payload ?? {}) as {
      customData?: { userId?: string };
      id?: string;
      subscriptionId?: string;
    };
    const userId = payload?.customData?.userId;
    const env = String(row.environment ?? "sandbox");
    if (!userId) continue;

    let granted = true;
    if (row.event_type === "subscription.created") {
      const { data: sub } = await db
        .from("subscribers")
        .select("subscribed")
        .eq("user_id", userId)
        .eq("environment", env)
        .maybeSingle();
      granted = Boolean(sub?.subscribed);
    } else {
      const txnId = payload?.id;
      const isPack = !payload?.subscriptionId;
      if (!isPack || !txnId) continue;
      const { data: purchase } = await db
        .from("purchases")
        .select("id")
        .eq("stripe_session_id", txnId)
        .eq("environment", env)
        .maybeSingle();
      granted = Boolean(purchase);
    }

    if (granted) continue;
    flagged += 1;
    await db.from("webhook_deliveries").update({ alerted_at: new Date().toISOString() }).eq("id", row.id);
    await raiseAlert({
      alertType: "entitlement_grant_delayed",
      severity: "critical",
      environment: env,
      subject: "A paid purchase has not been credited",
      dedupeKey: `entitlement-delay-${row.event_id}`,
      details: {
        event_id: row.event_id,
        event_type: row.event_type,
        user_id: userId,
        processed_at: row.processed_at,
      },
    });
  }
  return flagged;
}

/** 3. Advance the dunning schedule and message the customer. */
async function runDunning(): Promise<{ notified: number; paused: number }> {
  const db = admin();
  const nowIso = new Date().toISOString();
  const { data: rows } = await db
    .from("dunning_state")
    .select("id, user_id, environment, subscription_id, attempt_count, amount_due, currency, next_retry_at")
    .eq("status", "active")
    .lte("next_retry_at", nowIso)
    .limit(50);

  let notified = 0;
  let paused = 0;

  for (const row of rows ?? []) {
    const attempt = Number(row.attempt_count ?? 1) + 1;
    const nextRetryAt = attempt >= DUNNING_MAX_ATTEMPTS ? null : nextDunningRetry(attempt);
    const final = !nextRetryAt;

    const { data: subscriber } = await db
      .from("subscribers")
      .select("email, subscription_tier, current_period_end")
      .eq("user_id", row.user_id)
      .eq("environment", row.environment)
      .maybeSingle();

    const amount = formatMoney(row.amount_due, (row.currency ?? "usd").toUpperCase());

    if (subscriber?.email) {
      await sendTransactionalEmail({
        templateName: "payment-retry",
        recipientEmail: subscriber.email as string,
        idempotencyKey: `dunning-${row.id}-${attempt}`,
        templateData: {
          amount,
          planName: subscriber.subscription_tier ?? "Pro",
          attemptNumber: attempt,
          maxAttempts: DUNNING_MAX_ATTEMPTS,
          nextRetryDate: final ? "Final notice" : formatDate(nextRetryAt),
          updatePaymentUrl: "https://app.gradr.me/subscription",
        },
      });
    }

    await (db.rpc("enqueue_notification", {
      _user_id: row.user_id,
      _type: final ? "billing_subscription_paused" : "billing_payment_retry",
      _title: final ? "Your plan is paused" : `We'll retry your payment (attempt ${attempt})`,
      _body: final
        ? "We couldn't collect payment. Update your card to resume your plan straight away."
        : "Update your card any time to settle the balance instantly and avoid interruption.",
      _link: "/subscription",
      _metadata: { attempt, subscription_id: row.subscription_id },
    });

    await db.from("billing_events").insert({
      user_id: row.user_id,
      environment: row.environment,
      event_type: final ? "subscription_paused" : "payment_retry_scheduled",
      title: final ? "Plan paused after failed payments" : `Payment retry ${attempt} scheduled`,
      description: final
        ? "Update your payment method to resume immediately."
        : `Next attempt ${formatDate(nextRetryAt)}.`,
      amount_total: row.amount_due,
      currency: row.currency,
      subscription_id: row.subscription_id || null,
      metadata: { attempt },
    });

    await db.from("dunning_state").update({
      attempt_count: attempt,
      next_retry_at: nextRetryAt,
      status: final ? "exhausted" : "active",
      last_notified_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", row.id);

    notified += 1;
    if (final) {
      paused += 1;
      await raiseAlert({
        alertType: "dunning_exhausted",
        severity: "warning",
        environment: String(row.environment),
        subject: "A subscription exhausted its payment retries",
        dedupeKey: `dunning-exhausted-${row.id}`,
        details: { user_id: row.user_id, subscription_id: row.subscription_id, attempts: attempt },
      });
    }
  }

  return { notified, paused };
}

/**
 * Applies downgrades that were queued for the next renewal. Runs after the
 * paid period ends, so the customer always keeps the tier they paid for.
 */
async function applyScheduledPlanChanges(): Promise<{ applied: number; failed: number }> {
  const db = admin();
  const { data: due } = await db
    .from("scheduled_plan_changes")
    .select("id, user_id, environment, subscription_id, target_price_id, target_tier, target_interval")
    .eq("status", "pending")
    .lte("effective_at", new Date().toISOString())
    .limit(50);

  let applied = 0;
  let failed = 0;

  for (const row of due ?? []) {
    const env = (row.environment === "live" ? "live" : "sandbox") as PaddleEnv;
    try {
      const paddlePriceId = await resolvePaddlePriceId(env, row.target_price_id);
      if (!paddlePriceId) throw new Error(`price_unavailable:${row.target_price_id}`);

      const res = await gatewayFetch(env, `/subscriptions/${row.subscription_id}`, {
        method: "PATCH",
        body: JSON.stringify({
          items: [{ price_id: paddlePriceId, quantity: 1 }],
          proration_billing_mode: "do_not_bill",
        }),
      });
      if (!res.ok) throw new Error(`paddle_${res.status}:${await res.text()}`);

      await db.from("scheduled_plan_changes")
        .update({ status: "applied", applied_at: new Date().toISOString(), last_error: null })
        .eq("id", row.id);

      await db.from("subscribers").update({
        subscription_tier: row.target_tier,
        billing_interval: row.target_interval,
        price_id: row.target_price_id,
      }).eq("user_id", row.user_id).eq("environment", env);

      await db.from("billing_events").insert({
        user_id: row.user_id,
        environment: env,
        event_type: "plan_downgraded",
        title: `Switched to ${row.target_tier}`,
        description: "The scheduled plan change took effect at the start of this billing period.",
        subscription_id: row.subscription_id,
      });

      await db.rpc("enqueue_notification", {
        _user_id: row.user_id,
        _type: "billing_plan_changed",
        _title: `You're now on ${row.target_tier}`,
        _body: "Your scheduled plan change is live. Purchased credits are unaffected.",
        _link: "/subscription",
        _metadata: { subscription_id: row.subscription_id },
      });

      applied += 1;
    } catch (err) {
      failed += 1;
      await db.from("scheduled_plan_changes")
        .update({ last_error: String(err).slice(0, 500) })
        .eq("id", row.id);
      await raiseAlert({
        alertType: "plan_change_failed",
        severity: "warning",
        environment: env,
        subject: "Scheduled plan change failed",
        dedupeKey: `plan-change-${row.id}`,
        details: {
          subscription_id: row.subscription_id,
          target_price_id: row.target_price_id,
          error: String(err).slice(0, 300),
        },
      });
    }
  }

  return { applied, failed };
}

/**
 * 5. Trial reminders — Paddle does not send these, so we do. Anyone whose free
 * trial ends in 3 days or tomorrow gets one notice per milestone; the
 * idempotency key on the send makes repeated sweeps safe.
 */
async function runTrialReminders(): Promise<{ notified: number }> {
  const db = admin();
  const now = Date.now();
  const horizon = new Date(now + 4 * 24 * 60 * 60 * 1000).toISOString();

  const { data: trials } = await db
    .from("subscribers")
    .select("user_id, email, environment, subscription_tier, subscription_status, trial_end, cancel_at_period_end")
    .eq("subscription_status", "trialing")
    .not("trial_end", "is", null)
    .lte("trial_end", horizon)
    .gt("trial_end", new Date(now).toISOString());

  let notified = 0;
  for (const row of trials ?? []) {
    // Already cancelled: no charge is coming, so no reminder is owed.
    if (row.cancel_at_period_end) continue;
    const endsAt = new Date(String(row.trial_end));
    const daysLeft = Math.ceil((endsAt.getTime() - now) / (24 * 60 * 60 * 1000));
    if (daysLeft !== 3 && daysLeft !== 1) continue;

    const planName = row.subscription_tier
      ? String(row.subscription_tier).charAt(0).toUpperCase() + String(row.subscription_tier).slice(1)
      : "Pro";

    const sent = await sendTransactionalEmail({
      templateName: "trial-ending",
      recipientEmail: String(row.email),
      // One mail per milestone per subscriber, whatever the sweep cadence.
      idempotencyKey: `trial-ending-${row.user_id}-${row.environment}-${daysLeft}d-${String(row.trial_end).slice(0, 10)}`,
      templateData: {
        planName,
        daysLeft,
        trialEndsOn: formatDate(String(row.trial_end)),
      },
    }).catch((err) => {
      console.error("trial reminder failed", String(err));
      return null;
    });

    await db.rpc("enqueue_notification", {
      _user_id: row.user_id,
      _type: "billing_trial_ending",
      _title: daysLeft === 1 ? "Your trial ends tomorrow" : `Your trial ends in ${daysLeft} days`,
      _body: `Keep ${planName} and your first payment is taken on ${formatDate(String(row.trial_end))}. Cancel before then and you are not charged.`,
      _link: "/subscription",
      _metadata: { trial_end: row.trial_end, days_left: daysLeft },
    }) as unknown as Promise<unknown>).catch(() => {});

    if (sent) notified += 1;
  }

  return { notified };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Either the scheduler's own secret or the shared payments cron secret.
  const providedSecret = req.headers.get("x-cron-secret");
  const accepted = [Deno.env.get("BILLING_WATCHDOG_CRON_SECRET"), Deno.env.get("CRON_SECRET")]
    .filter((v): v is string => Boolean(v));
  let authorized = Boolean(providedSecret && accepted.includes(providedSecret));

  if (!authorized) {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) return json({ error: "Unauthorized" }, 401);
    const asUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await asUser.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);
    const { data: isAdmin } = await asUser.rpc("has_role", { _user_id: user.id, _role: "admin" });
    if (!isAdmin) return json({ error: "Forbidden" }, 403);
    authorized = true;
  }

  // Admin-triggered single actions from the billing ops console; anything else
  // (including the cron schedule) runs the full sweep.
  let action = "sweep";
  let payload: Record<string, unknown> = {};
  if (req.method === "POST") {
    payload = await req.json().catch(() => ({})) as Record<string, unknown>;
    action = String(payload.action ?? "sweep");
  }

  try {
    if (action === "replay_delivery") {
      const outcome = await replayDelivery(String(payload.deliveryId ?? ""));
      return json(outcome, outcome.ok ? 200 : 400);
    }

    if (action === "resolve_alert") {
      const { error } = await admin()
        .from("billing_alerts")
        .update({ resolved_at: new Date().toISOString() })
        .eq("id", String(payload.alertId ?? ""));
      if (error) return json({ ok: false, error: error.message }, 400);
      return json({ ok: true });
    }

    const retry = await runRetryQueue();
    const delayed = await checkDelayedEntitlements();
    const dunning = await runDunning();
    const planChanges = await applyScheduledPlanChanges();
    const trials = await runTrialReminders();
    return json({ ok: true, retry, delayedEntitlements: delayed, dunning, planChanges, trials });
  } catch (err) {
    console.error("payments-watchdog error", err);
    return json({ error: "watchdog_failed", message: String(err) }, 500);
  }
});

