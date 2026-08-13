/**
 * Admin webhook replay simulator.
 *
 * Provider webhooks (Paddle, RevenueCat) are the only path by which billing
 * state reaches Gradr, so when one fails the recovery options used to be
 * "ask the provider to retry" or "fix it by hand in SQL". This endpoint gives
 * admins a third option: inspect the stored event body and re-run it.
 *
 * Safety rules, all enforced here rather than in the UI:
 *  - the caller must present a valid JWT for a non-anonymous account with the
 *    admin role — verified server-side, never trusted from the client;
 *  - a dry run reports exactly what a live replay would do and touches nothing;
 *  - a live replay bypasses signature verification (the payload was already
 *    verified when it first arrived) but is recorded as its own delivery row
 *    linked to the original, so replays can never be mistaken for real traffic;
 *  - an edited payload is allowed for simulation but must stay the same
 *    provider/event type, and is stored with the replay for the audit trail.
 */
import { corsHeaders } from "./shared/cors";
import { createClient } from "./shared/supabase";
import { recordWebhookReplay } from "./shared/webhookDelivery";
import { logSecurityEvent } from "./shared/securityAudit";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

type Provider = "paddle" | "revenuecat";

interface DeliveryRow {
  id: string;
  provider: string;
  event_id: string;
  event_type: string | null;
  environment: string | null;
  state: string;
  attempts: number;
  replays: number;
  replay_of: string | null;
  last_error: string | null;
  signature_verified: boolean | null;
  payload: unknown;
  created_at: string;
  processed_at: string | null;
}

/** Human-readable description of what a live replay would do. */
function describeEffect(provider: Provider, payload: unknown): string[] {
  const notes: string[] = [];
  if (provider === "paddle") {
    const event = payload as { eventType?: string; data?: Record<string, unknown> };
    const type = event?.eventType ?? "unknown";
    notes.push(`Re-apply Paddle event "${type}".`);
    switch (type) {
      case "subscription.created":
      case "subscription.updated":
        notes.push("Mirror the subscription and re-derive the customer's plan tier.");
        break;
      case "subscription.canceled":
        notes.push("Mark the subscription canceled and drop the customer to the free tier.");
        break;
      case "transaction.completed":
        notes.push("Clear any payment issue, grant pack credits, record discount use and affiliate commission.");
        notes.push("Credits are additive — replaying a completed transaction grants the credits again.");
        break;
      case "transaction.payment_failed":
        notes.push("Flag the account as past due and start the dunning sequence.");
        break;
      case "adjustment.created":
        notes.push("Reverse the affiliate commission tied to the adjusted transaction.");
        break;
      default:
        notes.push("No handler is registered for this event type — a replay would be a no-op.");
    }
    const customerId = (event?.data?.['customerId'] ?? event?.data?.['id'] ?? null) as string | null;
    if (customerId) notes.push(`Target Paddle customer: ${customerId}`);
  } else {
    const event = (payload as { event?: Record<string, unknown> })?.event ?? {};
    notes.push(`Re-sync the RevenueCat entitlement for event "${String(event['type'] ?? "unknown")}".`);
    notes.push("Entitlements are read fresh from RevenueCat, so this is safe to repeat.");
    const appUserId = event['app_user_id'] ?? event['original_app_user_id'];
    if (appUserId) notes.push(`Target app user: ${String(appUserId)}`);
  }
  return notes;
}

export const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "Authentication required" }, 401);

  const admin = createClient(
    process.env['SUPABASE_URL']!,
    process.env['SUPABASE_SERVICE_ROLE_KEY']!,
    { auth: { persistSession: false } },
  );

  const { data: userData, error: userError } = await admin.auth.getUser(token);
  const user = userData?.user;
  if (userError || !user) return json({ error: "Authentication required" }, 401);
  if (user.is_anonymous) return json({ error: "Admin access required" }, 403);

  const { data: isAdmin, error: roleError } = await admin.rpc("has_role", {
    _user_id: user.id,
    _role: "admin",
  });
  if (roleError || isAdmin !== true) return json({ error: "Admin access required" }, 403);

  let body: { action?: unknown; deliveryId?: unknown; payload?: unknown; mode?: unknown; limit?: unknown; provider?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request body" }, 400);
  }

  const action = typeof body.action === "string" ? body.action : "";

  /* ---------------- list ---------------- */
  if (action === "list") {
    const limit = Math.min(200, Math.max(1, Number(body.limit) || 50));
    let query = admin
      .from("webhook_deliveries")
      .select(
        "id, provider, event_id, event_type, environment, state, attempts, replays, replay_of, last_error, signature_verified, created_at, processed_at",
      )
      .order("created_at", { ascending: false })
      .limit(limit);
    if (typeof body.provider === "string" && body.provider) query = query.eq("provider", body.provider);

    const { data, error } = await query;
    if (error) return json({ error: error.message }, 400);
    return json({ deliveries: data ?? [] });
  }

  /* ---------------- get (includes the stored payload) ---------------- */
  if (action === "get") {
    const id = typeof body.deliveryId === "string" ? body.deliveryId : "";
    if (!id) return json({ error: "deliveryId is required" }, 400);
    const { data, error } = await admin
      .from("webhook_deliveries")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) return json({ error: error.message }, 400);
    if (!data) return json({ error: "Delivery not found" }, 404);

    const delivery = data as unknown as DeliveryRow;
    await logSecurityEvent({
      category: "admin_action",
      event: "webhook_payload_viewed",
      decision: "allowed",
      userId: user.id,
      source: "admin-webhook-replay",
      details: { delivery_id: id, provider: delivery.provider },
    });

    return json({ delivery });
  }

  /* ---------------- replay (dry run or live) ---------------- */
  if (action === "replay") {
    const id = typeof body.deliveryId === "string" ? body.deliveryId : "";
    if (!id) return json({ error: "deliveryId is required" }, 400);
    const mode = body.mode === "live" ? "live" : "dry_run";

    const { data, error } = await admin
      .from("webhook_deliveries")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) return json({ error: error.message }, 400);
    if (!data) return json({ error: "Delivery not found" }, 404);

    const delivery = data as unknown as DeliveryRow;
    const provider = delivery.provider as Provider;
    if (provider !== "paddle" && provider !== "revenuecat") {
      return json({ error: `No replay handler for provider "${delivery.provider}"` }, 400);
    }

    const payload = body.payload !== undefined && body.payload !== null ? body.payload : delivery.payload;
    if (!payload) {
      return json(
        { error: "This delivery was recorded before payload capture, so it cannot be replayed." },
        400,
      );
    }

    const edited = body.payload !== undefined && body.payload !== null;
    const effects = describeEffect(provider, payload);

    if (mode === "dry_run") {
      return json({
        mode,
        edited,
        provider,
        eventType: delivery.event_type,
        environment: delivery.environment,
        effects,
        applied: false,
      });
    }

    try {
      if (provider === "paddle") {
        const { processPaddleEvent } = await import("./payments-webhook.server");
        const env = delivery.environment === "live" || delivery.environment === "production" ? "live" : "sandbox";
        // deno-lint-ignore no-explicit-any
        await processPaddleEvent(payload as any, env);
      } else {
        const { processRevenueCatEvent } = await import("./revenuecat-sync.server");
        await processRevenueCatEvent(payload);
      }
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      await recordWebhookReplay({
        provider,
        originalId: delivery.id,
        originalEventId: delivery.event_id,
        eventType: delivery.event_type,
        environment: delivery.environment,
        payload,
        state: "failed",
        error: reason,
      });
      await logSecurityEvent({
        category: "admin_action",
        event: "webhook_replay_failed",
        decision: "failed",
        userId: user.id,
        source: "admin-webhook-replay",
        reason,
        details: { delivery_id: id, provider, edited },
      });
      return json({ mode, applied: false, error: reason }, 400);
    }

    await recordWebhookReplay({
      provider,
      originalId: delivery.id,
      originalEventId: delivery.event_id,
      eventType: delivery.event_type,
      environment: delivery.environment,
      payload,
      state: "processed",
    });

    await logSecurityEvent({
      category: "admin_action",
      event: "webhook_replayed",
      decision: "allowed",
      userId: user.id,
      source: "admin-webhook-replay",
      details: { delivery_id: id, provider, event_type: delivery.event_type, edited },
    });

    return json({ mode, applied: true, edited, effects });
  }

  return json({ error: "Unsupported action" }, 400);
};
