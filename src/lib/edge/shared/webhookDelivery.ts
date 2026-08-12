/**
 * Idempotency + retry bookkeeping for inbound provider webhooks.
 *
 * Providers (Paddle, RevenueCat) retry deliveries for days, so every event is
 * claimed by its provider event id before it is processed:
 *  - first delivery  -> "claimed"   (process it)
 *  - already done    -> "duplicate" (ack 200 immediately, do no work)
 *  - previous failure-> "retry"     (process again, attempts incremented)
 *
 * The claim table also gives the admin dashboard a per-event delivery history.
 */
import { createClient } from "./supabase";

let _client: ReturnType<typeof createClient> | null = null;
function db() {
  if (!_client) {
    _client = createClient(
      process.env['SUPABASE_URL']!,
      process.env['SUPABASE_SERVICE_ROLE_KEY']!,
      { auth: { persistSession: false } },
    );
  }
  return _client;
}

export type ClaimResult = "claimed" | "retry" | "duplicate";

export async function claimWebhookEvent(params: {
  provider: string;
  eventId: string;
  eventType?: string | null;
  environment?: string | null;
}): Promise<ClaimResult> {
  const { provider, eventId } = params;

  const { data: existing } = await db()
    .from("webhook_deliveries")
    .select("id, state, attempts")
    .eq("provider", provider)
    .eq("event_id", eventId)
    .maybeSingle();

  if (existing?.id) {
    if (existing.state === "processed") return "duplicate";
    await db()
      .from("webhook_deliveries")
      .update({
        attempts: Number(existing.attempts ?? 1) + 1,
        state: "processing",
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
    return "retry";
  }

  const { error } = await db().from("webhook_deliveries").insert({
    provider,
    event_id: eventId,
    event_type: params.eventType ?? null,
    environment: params.environment ?? null,
    state: "processing",
  });

  // Unique-violation means a concurrent delivery won the race: treat as duplicate.
  if (error) return "duplicate";
  return "claimed";
}

export async function markWebhookProcessed(provider: string, eventId: string): Promise<void> {
  await db()
    .from("webhook_deliveries")
    .update({ state: "processed", last_error: null, updated_at: new Date().toISOString() })
    .eq("provider", provider)
    .eq("event_id", eventId);
}

export async function markWebhookFailed(
  provider: string,
  eventId: string,
  reason: string,
): Promise<void> {
  await db()
    .from("webhook_deliveries")
    .update({
      state: "failed",
      last_error: reason.slice(0, 1000),
      updated_at: new Date().toISOString(),
    })
    .eq("provider", provider)
    .eq("event_id", eventId);
}
