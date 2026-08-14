/**
 * Webhook delivery ledger (Paddle / RevenueCat).
 *
 * One row per inbound delivery attempt, including signature-verification
 * outcome. Payload previews are redacted and truncated — the ledger is a
 * debugging aid, not a copy of the provider's data.
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

const SENSITIVE = /(token|secret|password|authorization|api[_-]?key|signature|card|cvv|iban)/i;

/** Deep-redacts sensitive keys and truncates long strings. */
export function redactPayload(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[truncated]";
  if (value === null || value === undefined) return value ?? null;
  if (typeof value === "string") return value.length > 200 ? `${value.slice(0, 200)}…` : value;
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.slice(0, 10).map((v) => redactPayload(v, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>).slice(0, 40)) {
      out[k] = SENSITIVE.test(k) ? "[redacted]" : redactPayload(v, depth + 1);
    }
    return out;
  }
  return String(value);
}

export async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface WebhookDeliveryLog {
  provider: "paddle" | "revenuecat";
  environment?: string | null;
  eventType?: string | null;
  eventId?: string | null;
  source?: "live" | "test";
  signaturePresent?: boolean;
  signatureValid?: boolean | null;
  verificationError?: string | null;
  status: "received" | "processed" | "failed" | "rejected";
  httpStatus?: number | null;
  durationMs?: number | null;
  rawBody?: string | null;
  payload?: unknown;
  error?: string | null;
}

export async function logWebhookDelivery(entry: WebhookDeliveryLog): Promise<string | null> {
  try {
    const digest = entry.rawBody ? await sha256Hex(entry.rawBody) : null;
    const { data, error } = await db()
      .from("webhook_delivery_logs")
      .insert({
        provider: entry.provider,
        environment: entry.environment ?? null,
        event_type: entry.eventType ?? null,
        event_id: entry.eventId ?? null,
        source: entry.source ?? "live",
        signature_present: Boolean(entry.signaturePresent),
        signature_valid: entry.signatureValid ?? null,
        verification_error: entry.verificationError ? String(entry.verificationError).slice(0, 300) : null,
        status: entry.status,
        http_status: entry.httpStatus ?? null,
        duration_ms: entry.durationMs ?? null,
        payload_digest: digest,
        payload_preview: entry.payload === undefined ? null : redactPayload(entry.payload),
        error: entry.error ? String(entry.error).slice(0, 500) : null,
      })
      .select("id")
      .maybeSingle();
    if (error) throw error;
    return (data?.id as string) ?? null;
  } catch (e) {
    console.error("[webhookLog] failed to record delivery", e instanceof Error ? e.message : e);
    return null;
  }
}

export async function updateWebhookDelivery(
  id: string | null,
  patch: Partial<Pick<WebhookDeliveryLog, "status" | "httpStatus" | "durationMs" | "error" | "eventType" | "eventId">>,
): Promise<void> {
  if (!id) return;
  try {
    await db()
      .from("webhook_delivery_logs")
      .update({
        ...(patch.status ? { status: patch.status } : {}),
        ...(patch.httpStatus !== undefined ? { http_status: patch.httpStatus } : {}),
        ...(patch.durationMs !== undefined ? { duration_ms: patch.durationMs } : {}),
        ...(patch.eventType !== undefined ? { event_type: patch.eventType } : {}),
        ...(patch.eventId !== undefined ? { event_id: patch.eventId } : {}),
        ...(patch.error !== undefined ? { error: patch.error ? String(patch.error).slice(0, 500) : null } : {}),
      })
      .eq("id", id);
  } catch (e) {
    console.error("[webhookLog] failed to update delivery", e instanceof Error ? e.message : e);
  }
}
