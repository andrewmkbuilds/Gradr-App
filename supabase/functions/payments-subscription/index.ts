/**
 * Self-serve subscription management.
 *
 * Actions (all scoped to the signed-in user's own subscription):
 *  - `details`         — renewal date, next charge, payment method, dunning state
 *  - `payment_method`  — a Paddle portal URL for updating the card
 *  - `cancel`          — immediately, or at the end of the paid period
 *  - `resume`          — undo a scheduled cancellation
 *  - `invoices`        — past transactions with invoice PDF links
 *
 * The Paddle subscription id is always looked up server-side from the caller's
 * own row, so a client can never act on someone else's subscription.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { gatewayFetch, type PaddleEnv } from "../_shared/paddle.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function admin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

// deno-lint-ignore no-explicit-any
async function portalSession(env: PaddleEnv, customerId: string, subscriptionId?: string | null): Promise<any> {
  const res = await gatewayFetch(env, `/customers/${customerId}/portal-sessions`, {
    method: "POST",
    body: JSON.stringify({ subscription_ids: subscriptionId ? [subscriptionId] : [] }),
  });
  if (!res.ok) {
    console.error("portal session failed", res.status, await res.text());
    return null;
  }
  const body = await res.json();
  return body?.data ?? null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader) return json({ error: "Unauthorized" }, 401);

  const asUser = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user } } = await asUser.auth.getUser();
  if (!user) return json({ error: "Unauthorized" }, 401);

  const body = await req.json().catch(() => ({}));
  const env: PaddleEnv = body?.environment === "live" ? "live" : "sandbox";
  const action = String(body?.action ?? "details");

  const db = admin();
  const { data: sub } = await db
    .from("subscribers")
    .select(
      "stripe_customer_id, stripe_subscription_id, subscription_tier, subscription_status, billing_interval, current_period_end, cancel_at_period_end",
    )
    .eq("user_id", user.id)
    .eq("environment", env)
    .maybeSingle();

  let customerId = sub?.stripe_customer_id as string | undefined;
  if (!customerId) {
    const { data: mirrored } = await db
      .from("paddle_customers")
      .select("customer_id")
      .eq("user_id", user.id)
      .eq("environment", env)
      .maybeSingle();
    customerId = mirrored?.customer_id as string | undefined;
  }
  const subscriptionId = sub?.stripe_subscription_id as string | undefined;

  try {
    switch (action) {
      case "details": {
        const { data: dunning } = await db
          .from("dunning_state")
          .select("status, attempt_count, max_attempts, next_retry_at, amount_due, currency, last_failure_at")
          .eq("user_id", user.id)
          .eq("environment", env)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        // deno-lint-ignore no-explicit-any
        let remote: any = null;
        if (subscriptionId) {
          const res = await gatewayFetch(env, `/subscriptions/${subscriptionId}`);
          if (res.ok) remote = (await res.json())?.data ?? null;
        }

        return json({
          hasSubscription: Boolean(subscriptionId),
          tier: sub?.subscription_tier ?? null,
          status: remote?.status ?? sub?.subscription_status ?? null,
          interval: sub?.billing_interval ?? null,
          currentPeriodEnd: remote?.current_billing_period?.ends_at ?? sub?.current_period_end ?? null,
          cancelAtPeriodEnd: remote?.scheduled_change?.action === "cancel" ||
            Boolean(sub?.cancel_at_period_end),
          scheduledChange: remote?.scheduled_change ?? null,
          nextBilledAt: remote?.next_billed_at ?? null,
          nextChargeAmount: remote?.next_transaction?.details?.totals?.total ?? null,
          currency: remote?.currency_code ?? null,
          paymentMethod: remote?.payment_method ?? null,
          dunning: dunning ?? null,
        });
      }

      case "payment_method": {
        if (!customerId) return json({ error: "no_billing_account" }, 404);
        const session = await portalSession(env, customerId, subscriptionId);
        if (!session) return json({ error: "portal_unavailable" }, 502);
        const perSub = session.urls?.subscriptions?.[0];
        return json({
          url: perSub?.update_subscription_payment_method ?? session.urls?.general?.overview,
        });
      }

      case "cancel": {
        if (!subscriptionId) return json({ error: "no_subscription" }, 404);
        const immediate = body?.immediate === true;
        const res = await gatewayFetch(env, `/subscriptions/${subscriptionId}/cancel`, {
          method: "POST",
          body: JSON.stringify({
            effective_from: immediate ? "immediately" : "next_billing_period",
          }),
        });
        if (!res.ok) {
          console.error("cancel failed", res.status, await res.text());
          return json({ error: "cancel_failed" }, 502);
        }
        const canceled = (await res.json())?.data ?? {};

        // Reflect it locally right away — the webhook will confirm shortly.
        await db.from("subscribers").update({
          subscription_status: immediate ? "canceled" : sub?.subscription_status ?? "active",
          subscribed: immediate ? false : true,
          cancel_at_period_end: !immediate,
          ...(immediate ? { subscription_tier: null, current_period_end: new Date().toISOString() } : {}),
        }).eq("user_id", user.id).eq("environment", env);

        await db.from("billing_events").insert({
          user_id: user.id,
          environment: env,
          event_type: immediate ? "subscription_cancelled" : "subscription_cancel_scheduled",
          title: immediate ? "Subscription cancelled immediately" : "Cancellation scheduled",
          description: immediate
            ? "Access ended straight away, as requested."
            : `Access continues until ${canceled?.current_billing_period?.ends_at ?? "the end of the period"}.`,
          subscription_id: subscriptionId,
          metadata: { immediate, reason: String(body?.reason ?? "").slice(0, 200) || null },
        });

        return json({ ok: true, immediate, status: canceled?.status ?? null });
      }

      case "resume": {
        if (!subscriptionId) return json({ error: "no_subscription" }, 404);
        const res = await gatewayFetch(env, `/subscriptions/${subscriptionId}`, {
          method: "PATCH",
          body: JSON.stringify({ scheduled_change: null }),
        });
        if (!res.ok) {
          console.error("resume failed", res.status, await res.text());
          return json({ error: "resume_failed" }, 502);
        }
        await db.from("subscribers").update({ cancel_at_period_end: false })
          .eq("user_id", user.id).eq("environment", env);
        await db.from("billing_events").insert({
          user_id: user.id,
          environment: env,
          event_type: "subscription_resumed",
          title: "Cancellation reverted",
          description: "Your subscription will renew as normal.",
          subscription_id: subscriptionId,
        });
        return json({ ok: true });
      }

      case "invoices": {
        if (!customerId) return json({ invoices: [] });
        const res = await gatewayFetch(
          env,
          `/transactions?customer_id=${customerId}&per_page=50&order_by=created_at[DESC]`,
        );
        if (!res.ok) {
          console.error("invoice list failed", res.status, await res.text());
          return json({ invoices: [] });
        }
        // deno-lint-ignore no-explicit-any
        const rows: any[] = (await res.json())?.data ?? [];
        const invoices = rows
          .filter((t) => ["completed", "billed", "past_due"].includes(t.status))
          .map((t) => ({
            id: t.id,
            invoiceNumber: t.invoice_number ?? null,
            status: t.status,
            amount: Number(t.details?.totals?.grand_total ?? t.details?.totals?.total ?? 0),
            currency: t.currency_code ?? "USD",
            billedAt: t.billed_at ?? t.created_at,
            subscriptionId: t.subscription_id ?? null,
            description: t.items?.[0]?.price?.description ?? t.items?.[0]?.price?.name ?? null,
          }));
        return json({ invoices });
      }

      case "invoice_pdf": {
        const transactionId = String(body?.transactionId ?? "");
        if (!/^txn_[a-z0-9]+$/i.test(transactionId)) return json({ error: "bad_request" }, 400);
        // Ownership check: the transaction must belong to this customer.
        const check = await gatewayFetch(env, `/transactions/${transactionId}`);
        if (!check.ok) return json({ error: "not_found" }, 404);
        const txn = (await check.json())?.data;
        if (!customerId || txn?.customer_id !== customerId) return json({ error: "forbidden" }, 403);

        const res = await gatewayFetch(env, `/transactions/${transactionId}/invoice`);
        if (!res.ok) return json({ error: "invoice_unavailable" }, 502);
        const url = (await res.json())?.data?.url ?? null;
        return json({ url });
      }

      default:
        return json({ error: "unknown_action" }, 400);
    }
  } catch (err) {
    console.error("payments-subscription error", err);
    return json({ error: "unexpected_error" }, 500);
  }
});
