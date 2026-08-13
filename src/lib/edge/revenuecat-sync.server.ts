import { timingSafeEqual } from "node:crypto";
import { createClient } from "./shared/supabase";
import { corsHeaders } from "./shared/cors";
import { logSecurityEvent } from "./shared/securityAudit";
import {
  claimWebhookEvent,
  markWebhookFailed,
  markWebhookProcessed,
} from "./shared/webhookDelivery";

/**
 * Writes RevenueCat entitlement state into `subscribers` so every gate in the
 * app reads the same table regardless of which billing provider is active.
 *
 * Two callers are supported:
 *  1. The signed-in app ("Bearer <supabase jwt>") asking for a re-sync.
 *  2. RevenueCat's webhook ("Authorization: Bearer <REVENUECAT_WEBHOOK_SECRET>")
 *     posting an event envelope.
 *
 * SECURITY: entitlement state is NEVER taken from the request body. Callers
 * only identify *whose* entitlements to refresh; we then read the authoritative
 * subscriber record from RevenueCat's REST API (v1 /subscribers/{app_user_id})
 * using the secret key. A forged body therefore cannot grant a paid plan.
 */

const PRO_ENTITLEMENT = "pro";
const PROVIDER = "revenuecat";

function tierFor(productId: string | null | undefined) {
  if (!productId) return null;
  return productId.toLowerCase().includes("starter") ? "starter" : "pro";
}

function intervalFor(productId: string | null | undefined) {
  if (!productId) return null;
  const id = productId.toLowerCase();
  if (id.includes("year") || id.includes("annual") || id.includes("lifetime")) return "annual";
  if (id.includes("month")) return "monthly";
  return null;
}

interface RcEntitlement {
  expires_date: string | null;
  product_identifier?: string | null;
  unsubscribe_detected_at?: string | null;
}

function admin() {
  return createClient(
    process.env['SUPABASE_URL']!,
    process.env['SUPABASE_SERVICE_ROLE_KEY']!,
    { auth: { persistSession: false } },
  );
}

/** Constant-time secret comparison for the webhook Authorization header. */
function secretMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Reads RevenueCat for one app user id and mirrors the result into `subscribers`. */
async function syncUser(userId: string, email: string) {
  const secret = process.env['REVENUECAT_SECRET_KEY'];
  if (!secret) {
    const err = new Error("REVENUECAT_SECRET_KEY is not configured");
    (err as Error & { status?: number }).status = 503;
    throw err;
  }

  const rcRes = await fetch(
    `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`,
    { headers: { Authorization: `Bearer ${secret}`, Accept: "application/json" } },
  );
  if (!rcRes.ok) {
    const err = new Error(`RevenueCat API error ${rcRes.status}`);
    (err as Error & { status?: number }).status = 502;
    throw err;
  }

  const rcBody = await rcRes.json();
  const entitlements = (rcBody?.subscriber?.entitlements ?? {}) as Record<string, RcEntitlement>;
  const ent = entitlements[PRO_ENTITLEMENT];

  const expiresDate = ent?.expires_date ?? null;
  // Lifetime entitlements have a null expiry; otherwise it must be in the future.
  const active = Boolean(ent) && (expiresDate === null || new Date(expiresDate) > new Date());
  const productIdentifier = active ? ent?.product_identifier ?? null : null;
  const willRenew = active ? !ent?.unsubscribe_detected_at : false;

  await admin().from("subscribers").upsert(
    {
      user_id: userId,
      email,
      subscribed: active,
      subscription_tier: active ? tierFor(productIdentifier) : null,
      billing_interval: active ? intervalFor(productIdentifier) : null,
      subscription_status: active ? "active" : "none",
      price_id: productIdentifier,
      current_period_end: expiresDate,
      cancel_at_period_end: active ? !willRenew : false,
    },
    { onConflict: "user_id" },
  );

  return { subscribed: active, tier: active ? tierFor(productIdentifier) : null };
}

/**
 * Re-applies a stored RevenueCat event by re-syncing the affected user against
 * RevenueCat's own API. Used by the admin replay simulator.
 */
export async function processRevenueCatEvent(body: unknown): Promise<{ subscribed: boolean }> {
  const event = (body as { event?: Record<string, unknown> })?.event ?? {};
  const appUserId = (event['app_user_id'] ?? event['original_app_user_id'] ?? null) as string | null;
  if (!appUserId) throw new Error("Event has no app_user_id");
  const { data: userRes } = await admin().auth.admin.getUserById(appUserId);
  const email = userRes?.user?.email;
  if (!email) throw new Error("No Gradr account matches this app_user_id");
  return syncUser(appUserId, email);
}

export const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) return json({ error: "Unauthorized" }, 401);

  const webhookSecret = process.env['REVENUECAT_WEBHOOK_SECRET'];
  const isWebhook = Boolean(webhookSecret) && secretMatches(token, webhookSecret as string);

  /* ---------------- RevenueCat webhook path ---------------- */
  if (isWebhook) {
    let eventId: string | null = null;
    try {
      const body = await req.json().catch(() => ({}));
      const event = body?.event ?? {};
      eventId = (event.id ?? null) as string | null;
      const appUserId = (event.app_user_id ?? event.original_app_user_id ?? null) as string | null;

      if (!appUserId) return json({ received: true, ignored: "no app_user_id" }, 200);

      if (eventId) {
        const claim = await claimWebhookEvent({
          provider: PROVIDER,
          eventId,
          eventType: String(event.type ?? "unknown"),
          environment: event.environment ?? null,
          payload: body,
          signatureVerified: true,
        });
        if (claim === "duplicate") return json({ received: true, duplicate: true }, 200);
      }

      const { data: userRes } = await admin().auth.admin.getUserById(appUserId);
      const email = userRes?.user?.email;
      if (!email) {
        if (eventId) await markWebhookProcessed(PROVIDER, eventId);
        return json({ received: true, ignored: "unknown user" }, 200);
      }

      const result = await syncUser(appUserId, email);
      if (eventId) await markWebhookProcessed(PROVIDER, eventId);

      await logSecurityEvent({
        category: "billing_webhook",
        event: String(event.type ?? "revenuecat_event"),
        decision: "processed",
        userId: appUserId,
        source: "revenuecat-sync",
        details: { event_id: eventId, subscribed: result.subscribed },
      });

      return json({ received: true, ...result }, 200);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.error("revenuecat webhook error", err);
      if (eventId) await markWebhookFailed(PROVIDER, eventId, reason);
      await logSecurityEvent({
        category: "billing_webhook",
        event: "handler_error",
        decision: "failed",
        source: "revenuecat-sync",
        reason,
      });
      // 5xx so RevenueCat retries with backoff.
      return json({ error: "Webhook processing failed" }, 500);
    }
  }

  /* ---------------- Signed-in app re-sync path ---------------- */
  try {
    const anon = createClient(
      process.env['SUPABASE_URL']!,
      process.env['SUPABASE_PUBLISHABLE_KEY']!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData } = await anon.auth.getUser();
    const user = userData?.user;
    if (!user?.email) return json({ error: "Unauthorized" }, 401);

    const result = await syncUser(user.id, user.email);
    return json(result);
  } catch (err) {
    const status = (err as Error & { status?: number })?.status;
    console.error("revenuecat-sync error", err);
    if (status === 503) return json({ error: "Billing sync is not available right now." }, 503);
    if (status === 502) return json({ error: "Unable to verify your subscription right now." }, 502);
    return json({ error: "Unable to sync entitlements right now." }, 500);
  }
};
