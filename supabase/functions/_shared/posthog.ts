/**
 * Server-side PostHog capture for revenue events.
 *
 * Paid conversions are recorded here, from the provider webhook, and never from
 * the browser: a checkout click is intent, only Paddle can confirm money moved.
 * `distinct_id` is the Gradr user id so these events join the same person as
 * their anonymous first visit.
 *
 * Analytics must never break billing — every failure is logged and swallowed.
 * But a swallowed failure that nobody sees is exactly how funnels rot, so every
 * attempt is also written to `analytics_event_deliveries`. That ledger is what
 * `detect_analytics_regressions()` and `/admin/analytics-health` read to catch
 * missing, duplicated or delayed conversion events.
 */
import { createClient } from "npm:@supabase/supabase-js@2";

const TOKEN = Deno.env.get("POSTHOG_API_KEY");
const REGION = Deno.env.get("POSTHOG_REGION") || "eu";
const HOST = REGION === "us" ? "https://us.i.posthog.com" : "https://eu.i.posthog.com";

let _db: ReturnType<typeof createClient> | null = null;
function db() {
  if (!_db) {
    _db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );
  }
  return _db;
}

export interface CaptureContext {
  /** Provider event id (Paddle `evt_…`) the capture belongs to. */
  providerEventId?: string | null;
  /** Which function emitted it — shows up in the health dashboard. */
  source?: string;
  environment?: string | null;
}

async function record(entry: {
  event: string;
  distinctId: string | null;
  status: "ok" | "failed" | "skipped";
  httpStatus?: number | null;
  latencyMs?: number | null;
  error?: string | null;
  ctx: CaptureContext;
}) {
  try {
    await db().from("analytics_event_deliveries").insert({
      event_name: entry.event,
      distinct_id: entry.distinctId,
      source: entry.ctx.source ?? "payments-webhook",
      provider_event_id: entry.ctx.providerEventId ?? null,
      environment: entry.ctx.environment ?? null,
      // One logical conversion per provider event per event name: a second row
      // with the same key is a double-count, which the detector alerts on.
      dedupe_key: entry.ctx.providerEventId
        ? `${entry.ctx.providerEventId}:${entry.event}`
        : null,
      status: entry.status,
      http_status: entry.httpStatus ?? null,
      latency_ms: entry.latencyMs ?? null,
      error: entry.error ? String(entry.error).slice(0, 400) : null,
    });
  } catch (err) {
    console.error("[posthog] ledger write failed:", err instanceof Error ? err.message : err);
  }
}

export async function capture(
  event: string,
  distinctId: string | null,
  properties: Record<string, unknown> = {},
  ctx: CaptureContext = {},
) {
  // `$set` is a person-property update, not a funnel step — it is not ledgered.
  const ledgered = event !== "$set";

  if (!TOKEN) {
    if (ledgered) {
      await record({ event, distinctId, status: "skipped", error: "POSTHOG_API_KEY missing", ctx });
    }
    return;
  }
  if (!distinctId) {
    // Un-attributed revenue would corrupt funnel math — but losing it silently
    // is itself a tracking regression, so it is recorded as skipped.
    if (ledgered) {
      await record({ event, distinctId, status: "skipped", error: "missing distinct_id", ctx });
    }
    return;
  }

  const startedAt = Date.now();
  try {
    const res = await fetch(`${HOST}/i/v0/e/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: TOKEN,
        event,
        distinct_id: distinctId,
        properties: {
          ...properties,
          $lib: "gradr-server",
          source: "webhook",
          ...(ctx.providerEventId ? { provider_event_id: ctx.providerEventId } : {}),
        },
      }),
    });
    const latencyMs = Date.now() - startedAt;
    if (!res.ok) {
      const body = await res.text();
      console.error(`PostHog capture failed [${res.status}]: ${body}`);
      if (ledgered) {
        await record({
          event,
          distinctId,
          status: "failed",
          httpStatus: res.status,
          latencyMs,
          error: `${res.status}: ${body}`,
          ctx,
        });
      }
      return;
    }
    if (ledgered) {
      await record({ event, distinctId, status: "ok", httpStatus: res.status, latencyMs, ctx });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("PostHog capture error:", message);
    if (ledgered) {
      await record({
        event,
        distinctId,
        status: "failed",
        latencyMs: Date.now() - startedAt,
        error: message,
        ctx,
      });
    }
  }
}

/** Sets durable person properties (plan, paying status) from the server. */
export async function setPerson(distinctId: string | null, props: Record<string, unknown>) {
  if (!TOKEN || !distinctId) return;
  await capture("$set", distinctId, { $set: props });
}
