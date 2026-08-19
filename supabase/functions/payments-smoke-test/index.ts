/**
 * End-to-end payments smoke test (sandbox only).
 *
 * Exercises the whole money path the way a real customer would hit it, on a
 * throwaway user that is deleted again at the end:
 *
 *   1. CATALOG    — resolve `pro_annual` through the Paddle gateway.
 *   2. CHECKOUT   — create a real sandbox transaction for that price, with the
 *                   same `custom_data.userId` the client attaches.
 *   3. WEBHOOK    — sign a `subscription.created` event with the sandbox
 *                   webhook secret and POST it to `payments-webhook`, exactly
 *                   as Paddle would.
 *   4. ENTITLEMENT— assert the subscriber row, tier, and the annual bonus
 *                   credits actually landed in the database.
 *   5. CLEANUP    — delete every row and the temp auth user.
 *
 * Auth: `x-cron-secret` matching CRON_SECRET, or a signed-in admin.
 * Refuses to run against live.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { ANNUAL_BONUS, gatewayFetch, getWebhookSecret } from "../_shared/paddle.ts";

const PRICE_ID = "pro_annual";
const EXPECTED_TIER = "pro";

function admin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

interface Step {
  name: string;
  ok: boolean;
  detail?: string;
}

/** Paddle's `ts=…;h1=…` signature over `${ts}:${rawBody}`. */
async function signPayload(rawBody: string, secret: string): Promise<string> {
  const ts = Math.floor(Date.now() / 1000).toString();
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${ts}:${rawBody}`));
  const hex = Array.from(new Uint8Array(mac)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `ts=${ts};h1=${hex}`;
}

async function runSmokeTest(): Promise<{ ok: boolean; steps: Step[] }> {
  const db = admin();
  const steps: Step[] = [];
  const env = "sandbox" as const;
  const runId = crypto.randomUUID().slice(0, 8);

  let userId: string | null = null;
  const subscriptionId = `sub_smoke_${runId}`;

  const step = (name: string, ok: boolean, detail?: string) => {
    steps.push({ name, ok, detail });
    if (!ok) throw new Error(`${name}: ${detail ?? "failed"}`);
  };

  try {
    // ---- 0. Throwaway customer -------------------------------------------
    const email = `payments-smoke+${runId}@gradr.test`;
    const { data: created, error: userErr } = await db.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { smoke_test: true },
    });
    step("create temp user", Boolean(created?.user?.id), userErr?.message);
    userId = created!.user!.id;

    // ---- 1. Catalog -------------------------------------------------------
    const priceRes = await gatewayFetch(env, `/prices?external_id=${PRICE_ID}&status=active`);
    const priceBody = priceRes.ok ? await priceRes.json() : null;
    const paddlePriceId: string | undefined = priceBody?.data?.[0]?.id;
    step("resolve price in catalog", Boolean(paddlePriceId), `${PRICE_ID} -> ${paddlePriceId ?? "not found"}`);

    // ---- 2. Checkout ------------------------------------------------------
    const txRes = await gatewayFetch(env, "/transactions", {
      method: "POST",
      body: JSON.stringify({
        items: [{ price_id: paddlePriceId, quantity: 1 }],
        custom_data: { userId, smokeTest: true },
        collection_mode: "automatic",
      }),
    });
    const txBody = await txRes.json().catch(() => null);
    step(
      "create checkout transaction",
      txRes.ok && Boolean(txBody?.data?.id),
      txRes.ok ? `transaction ${txBody?.data?.id}` : JSON.stringify(txBody).slice(0, 300),
    );

    // ---- 3. Webhook -------------------------------------------------------
    const now = new Date();
    const periodEnd = new Date(now.getTime() + 365 * 24 * 3600 * 1000).toISOString();
    const payload = {
      event_id: `evt_smoke_${runId}`,
      event_type: "subscription.created",
      occurred_at: now.toISOString(),
      notification_id: `ntf_smoke_${runId}`,
      data: {
        id: subscriptionId,
        status: "active",
        customer_id: `ctm_smoke_${runId}`,
        custom_data: { userId },
        currency_code: "USD",
        current_billing_period: { starts_at: now.toISOString(), ends_at: periodEnd },
        items: [{
          quantity: 1,
          price: {
            id: paddlePriceId,
            product_id: `pro_smoke_${runId}`,
            import_meta: { external_id: PRICE_ID },
            unit_price: { amount: "16000", currency_code: "USD" },
            billing_cycle: { interval: "year", frequency: 1 },
          },
          product: {
            id: `pro_smoke_${runId}`,
            name: "Gradr Pro",
            import_meta: { external_id: "pro_plan" },
          },
        }],
      },
    };
    const raw = JSON.stringify(payload);
    const signature = await signPayload(raw, getWebhookSecret(env));
    const hookRes = await fetch(
      `${Deno.env.get("SUPABASE_URL")}/functions/v1/payments-webhook?env=sandbox`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "paddle-signature": signature },
        body: raw,
      },
    );
    step(
      "deliver signed webhook",
      hookRes.ok,
      `HTTP ${hookRes.status} ${(await hookRes.text()).slice(0, 200)}`,
    );

    // The handler writes before responding, but give async fan-out a beat.
    await new Promise((r) => setTimeout(r, 1500));

    // ---- 4. Entitlements --------------------------------------------------
    const { data: sub } = await db
      .from("subscribers")
      .select("subscribed, subscription_tier, billing_interval, price_id, current_period_end")
      .eq("user_id", userId)
      .eq("environment", env)
      .maybeSingle();
    step(
      "subscriber row granted",
      Boolean(sub?.subscribed) && sub?.subscription_tier === EXPECTED_TIER && sub?.price_id === PRICE_ID,
      JSON.stringify(sub ?? null),
    );

    const bonus = ANNUAL_BONUS[EXPECTED_TIER];
    const { data: credits } = await db
      .from("usage_credits")
      .select("application_credits, interview_credits")
      .eq("user_id", userId)
      .eq("environment", env)
      .maybeSingle();
    step(
      "annual bonus credits granted",
      Number(credits?.application_credits ?? 0) >= bonus.application &&
        Number(credits?.interview_credits ?? 0) >= bonus.interview,
      `expected >=${bonus.application}/${bonus.interview}, got ${credits?.application_credits ?? 0}/${
        credits?.interview_credits ?? 0
      }`,
    );

    // Replaying the same event must not double-grant.
    const replay = await fetch(
      `${Deno.env.get("SUPABASE_URL")}/functions/v1/payments-webhook?env=sandbox`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "paddle-signature": await signPayload(raw, getWebhookSecret(env)),
        },
        body: raw,
      },
    );
    await new Promise((r) => setTimeout(r, 1000));
    const { data: afterReplay } = await db
      .from("usage_credits")
      .select("application_credits, interview_credits")
      .eq("user_id", userId)
      .eq("environment", env)
      .maybeSingle();
    step(
      "replay is idempotent",
      replay.ok &&
        Number(afterReplay?.application_credits ?? 0) === Number(credits?.application_credits ?? 0),
      `${credits?.application_credits ?? 0} -> ${afterReplay?.application_credits ?? 0}`,
    );

    return { ok: true, steps };
  } catch (err) {
    console.error("payments smoke test failed", err);
    return { ok: false, steps };
  } finally {
    // ---- 5. Cleanup -------------------------------------------------------
    if (userId) {
      const db2 = admin();
      await db2.from("usage_credits").delete().eq("user_id", userId);
      await db2.from("purchases").delete().eq("user_id", userId);
      await db2.from("subscribers").delete().eq("user_id", userId);
      await db2.from("billing_events").delete().eq("user_id", userId);
      await db2.from("notifications").delete().eq("user_id", userId);
      await db2.auth.admin.deleteUser(userId).catch(() => {});
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const provided = req.headers.get("x-cron-secret");
  const cronSecret = Deno.env.get("CRON_SECRET");
  let authorized = Boolean(provided && cronSecret && provided === cronSecret);

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

  // Never touch live money.
  const url = new URL(req.url);
  if (url.searchParams.get("env") === "live") {
    return json({ error: "smoke_test_is_sandbox_only" }, 400);
  }

  const result = await runSmokeTest();
  return json({ ...result, environment: "sandbox" }, result.ok ? 200 : 500);
});
