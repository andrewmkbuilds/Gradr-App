/**
 * Outbound-provider health telemetry.
 *
 * Every third-party call we care about (Paddle, ElevenLabs, Adzuna, Corvi,
 * Lovable AI, ...) records one row per attempt so `/admin/api-health` can show
 * availability, latency and rate-limit/backoff pressure. Writes are
 * best-effort: telemetry must never fail the request it is measuring.
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

export interface ApiHealthEvent {
  provider: string;
  endpoint: string;
  method?: string;
  statusCode?: number | null;
  ok: boolean;
  durationMs?: number | null;
  rateLimited?: boolean;
  retryAfterMs?: number | null;
  attempt?: number;
  errorMessage?: string | null;
  environment?: string | null;
  userId?: string | null;
}

/** Parses `Retry-After` (seconds or HTTP date) into milliseconds. */
export function retryAfterMs(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, Math.round(seconds * 1000));
  const when = Date.parse(header);
  if (!Number.isNaN(when)) return Math.max(0, when - Date.now());
  return null;
}

export async function logApiHealth(event: ApiHealthEvent): Promise<void> {
  try {
    await db().from("api_health_events").insert({
      provider: event.provider,
      endpoint: event.endpoint.slice(0, 300),
      method: event.method ?? "POST",
      status_code: event.statusCode ?? null,
      outcome: event.ok ? "success" : event.rateLimited ? "rate_limited" : "error",
      duration_ms: event.durationMs ?? null,
      rate_limited: Boolean(event.rateLimited),
      retry_after_ms: event.retryAfterMs ?? null,
      attempt: event.attempt ?? 1,
      // Never store provider bodies verbatim — they can echo request content.
      error_message: event.errorMessage ? String(event.errorMessage).slice(0, 300) : null,
      environment: event.environment ?? null,
      user_id: event.userId ?? null,
    });
  } catch (e) {
    console.error("[apiHealth] failed to record event", e instanceof Error ? e.message : e);
  }
}

/**
 * Wraps a fetch so the attempt is measured and recorded. Returns the response
 * untouched so callers keep full control over error handling.
 */
export async function trackedFetch(
  provider: string,
  input: string,
  init: RequestInit = {},
  meta: { attempt?: number; environment?: string | null; userId?: string | null } = {},
): Promise<Response> {
  const started = Date.now();
  const endpoint = (() => {
    try {
      const u = new URL(input);
      return `${u.host}${u.pathname}`;
    } catch {
      return input;
    }
  })();

  try {
    const res = await fetch(input, init);
    await logApiHealth({
      provider,
      endpoint,
      method: (init.method ?? "GET").toUpperCase(),
      statusCode: res.status,
      ok: res.ok,
      durationMs: Date.now() - started,
      rateLimited: res.status === 429,
      retryAfterMs: retryAfterMs(res.headers.get("retry-after")),
      attempt: meta.attempt ?? 1,
      errorMessage: res.ok ? null : `HTTP ${res.status}`,
      environment: meta.environment ?? null,
      userId: meta.userId ?? null,
    });
    return res;
  } catch (e) {
    await logApiHealth({
      provider,
      endpoint,
      method: (init.method ?? "GET").toUpperCase(),
      ok: false,
      durationMs: Date.now() - started,
      attempt: meta.attempt ?? 1,
      errorMessage: e instanceof Error ? e.message : "network_error",
      environment: meta.environment ?? null,
      userId: meta.userId ?? null,
    });
    throw e;
  }
}
