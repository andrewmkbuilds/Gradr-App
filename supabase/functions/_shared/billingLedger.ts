/**
 * Customer-facing billing ledger + dunning state.
 *
 * `billing_events` is what the user sees on their billing history page, so it
 * only ever holds human-readable, non-sensitive summaries. `dunning_state`
 * drives the failed-payment recovery flow (retry schedule + messaging).
 */
import { createClient } from "npm:@supabase/supabase-js@2";

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

export interface BillingEventInput {
  userId: string | null | undefined;
  environment: string;
  eventType: string;
  title: string;
  description?: string | null;
  amountTotal?: number | null;
  currency?: string | null;
  subscriptionId?: string | null;
  transactionId?: string | null;
  occurredAt?: string | null;
  metadata?: Record<string, unknown>;
}

/** Records one timeline entry. Best-effort: never fails the calling webhook. */
export async function recordBillingEvent(input: BillingEventInput): Promise<void> {
  if (!input.userId) return;
  try {
    const { error } = await db().from("billing_events").upsert(
      {
        user_id: input.userId,
        environment: input.environment,
        event_type: input.eventType,
        title: input.title,
        description: input.description ?? null,
        amount_total: input.amountTotal ?? null,
        currency: (input.currency ?? null)?.toLowerCase() ?? null,
        subscription_id: input.subscriptionId ?? null,
        transaction_id: input.transactionId ?? null,
        metadata: input.metadata ?? {},
        occurred_at: input.occurredAt ?? new Date().toISOString(),
      },
      {
        onConflict: "user_id,environment,event_type,transaction_id,subscription_id,occurred_at",
        ignoreDuplicates: true,
      },
    );
    if (error) console.error("recordBillingEvent failed", error.message);
  } catch (err) {
    console.error("recordBillingEvent threw", String(err));
  }
}

/** Backoff between dunning retries, in hours, indexed by attempt number. */
export const DUNNING_SCHEDULE_HOURS = [24, 72, 120];
export const DUNNING_MAX_ATTEMPTS = 4;

export function nextDunningRetry(attempt: number): string | null {
  const hours = DUNNING_SCHEDULE_HOURS[attempt - 1];
  if (hours === undefined) return null;
  return new Date(Date.now() + hours * 3600_000).toISOString();
}

/** Opens or advances a dunning cycle after a failed charge. */
export async function openDunning(params: {
  userId: string;
  environment: string;
  subscriptionId: string | null;
  amountDue?: number | null;
  currency?: string | null;
}): Promise<{ attempt: number; nextRetryAt: string | null }> {
  const { data: existing } = await db()
    .from("dunning_state")
    .select("id, attempt_count, status")
    .eq("user_id", params.userId)
    .eq("environment", params.environment)
    .eq("subscription_id", params.subscriptionId ?? "")
    .maybeSingle();

  const active = existing && existing.status === "active";
  const attempt = active ? Number(existing!.attempt_count ?? 1) + 1 : 1;
  const nextRetryAt = attempt >= DUNNING_MAX_ATTEMPTS ? null : nextDunningRetry(attempt);

  await db().from("dunning_state").upsert(
    {
      ...(existing ? { id: existing.id } : {}),
      user_id: params.userId,
      environment: params.environment,
      subscription_id: params.subscriptionId ?? "",
      status: attempt >= DUNNING_MAX_ATTEMPTS ? "exhausted" : "active",
      attempt_count: attempt,
      max_attempts: DUNNING_MAX_ATTEMPTS,
      amount_due: params.amountDue ?? null,
      currency: (params.currency ?? "usd").toLowerCase(),
      last_failure_at: new Date().toISOString(),
      next_retry_at: nextRetryAt,
      recovered_at: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );

  return { attempt, nextRetryAt };
}

/** Closes any open dunning cycle once a charge succeeds. */
export async function closeDunning(params: {
  userId?: string | null;
  environment: string;
  subscriptionId?: string | null;
}): Promise<boolean> {
  let query = db()
    .from("dunning_state")
    .update({
      status: "recovered",
      next_retry_at: null,
      recovered_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("environment", params.environment)
    .neq("status", "recovered");

  if (params.subscriptionId) query = query.eq("subscription_id", params.subscriptionId);
  else if (params.userId) query = query.eq("user_id", params.userId);
  else return false;

  const { data } = await query.select("id");
  return Boolean(data?.length);
}
