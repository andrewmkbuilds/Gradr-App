/**
 * Sandbox-only payment simulator.
 *
 * Lets an admin fabricate the failure paths that are otherwise painful to
 * reproduce — a webhook that never processes, a declined renewal, a refund —
 * and then watch the retry queue, dunning cycle and entitlement reversals run
 * end to end. Hard-refuses to run against the live environment.
 *
 * Every run is written to `payment_simulations` so the admin console can show
 * what was faked, by whom, and what came back.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

type Scenario =
  | "webhook_failure"
  | "payment_failed"
  | "refund_credit_pack"
  | "refund_subscription"
  | "run_watchdog";

function admin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const base = () => Deno.env.get("SUPABASE_URL")!;
const serviceKey = () => Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

/** Posts a synthetic event straight at the webhook using the internal replay path. */
async function postEvent(eventType: string, eventId: string, data: unknown) {
  const res = await fetch(`${base()}/functions/v1/payments-webhook?env=sandbox`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-replay": Deno.env.get("CRON_SECRET") ?? "",
      apikey: serviceKey(),
      Authorization: `Bearer ${serviceKey()}`,
    },
    body: JSON.stringify({ eventType, eventId, data }),
  }).catch(() => null);
  return { status: res?.status ?? 0, ok: Boolean(res?.ok), body: await res?.text().catch(() => "") };
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
  const { data: isAdmin } = await asUser.rpc("has_role", { _user_id: user.id, _role: "admin" });
  if (!isAdmin) return json({ error: "Forbidden" }, 403);

  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const scenario = String(body.scenario ?? "") as Scenario;
  const environment = String(body.environment ?? "sandbox");
  // Simulations mutate real entitlements — never allow that against live money.
  if (environment !== "sandbox") return json({ error: "sandbox_only" }, 400);

  const targetUserId = (body.targetUserId as string | undefined) ?? user.id;
  const stamp = Date.now();
  let result: Record<string, unknown> = {};
  let ok = false;

  try {
    switch (scenario) {
      case "webhook_failure": {
        // A stored delivery stuck in `failed` — the retry queue should pick it
        // up on the next watchdog sweep and eventually alert if it can't.
        const eventId = `sim_evt_${stamp}`;
        const { error } = await admin().from("webhook_deliveries").insert({
          provider: "paddle",
          event_id: eventId,
          event_type: "transaction.completed",
          environment: "sandbox",
          state: "failed",
          attempts: Number(body.attempts ?? 0),
          last_error: "simulated failure",
          signature_verified: true,
          payload: {
            id: `txn_sim_${stamp}`,
            status: "completed",
            currencyCode: "USD",
            customData: { userId: targetUserId, simulated: true },
            details: { totals: { total: "1900" } },
            items: [],
          },
        });
        if (error) throw new Error(error.message);
        result = { event_id: eventId, note: "Queued as failed; run the watchdog to replay it." };
        ok = true;
        break;
      }

      case "payment_failed": {
        const res = await postEvent("transaction.payment_failed", `sim_evt_${stamp}`, {
          id: `txn_sim_${stamp}`,
          subscriptionId: body.subscriptionId ?? null,
          currencyCode: "USD",
          customData: { userId: targetUserId, simulated: true },
          details: { totals: { total: "1900" } },
          updatedAt: new Date().toISOString(),
        });
        result = res;
        ok = res.ok;
        break;
      }

      case "refund_credit_pack":
      case "refund_subscription": {
        const res = await postEvent("adjustment.created", `sim_evt_${stamp}`, {
          id: `adj_sim_${stamp}`,
          action: String(body.action ?? "refund"),
          transactionId: body.transactionId ?? null,
          subscriptionId: scenario === "refund_subscription" ? (body.subscriptionId ?? null) : null,
          currencyCode: "USD",
          totals: { total: String(body.amount ?? "1900") },
          customData: { userId: targetUserId, simulated: true },
          createdAt: new Date().toISOString(),
        });
        result = res;
        ok = res.ok;
        break;
      }

      case "run_watchdog": {
        const res = await fetch(`${base()}/functions/v1/payments-watchdog`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-cron-secret": Deno.env.get("CRON_SECRET") ?? "",
            apikey: serviceKey(),
            Authorization: `Bearer ${serviceKey()}`,
          },
          body: JSON.stringify({ action: "sweep" }),
        }).catch(() => null);
        result = { status: res?.status ?? 0, body: await res?.json().catch(() => ({})) };
        ok = Boolean(res?.ok);
        break;
      }

      default:
        return json({ error: "unknown_scenario" }, 400);
    }
  } catch (err) {
    result = { error: String(err) };
    ok = false;
  }

  await admin().from("payment_simulations").insert({
    admin_user_id: user.id,
    scenario,
    environment: "sandbox",
    target_user_id: targetUserId,
    ok,
    result,
  });

  return json({ ok, scenario, result }, ok ? 200 : 400);
});
