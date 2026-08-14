/**
 * Durable, cross-instance rate limiting for AI endpoints.
 *
 * Edge functions run as many short-lived isolates, so an in-memory `Map` of
 * request timestamps is effectively no limit at all: it resets on every cold
 * start and is not shared between concurrent isolates. An attacker who simply
 * sends requests in parallel gets a fresh counter each time.
 *
 * This helper pushes the counter into Postgres, where a single atomic upsert
 * is authoritative for every isolate. `assert_ai_rate_limit` is SECURITY
 * DEFINER with EXECUTE revoked from `anon`/`authenticated`, so only trusted
 * server code (service role) can move the counter.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

let _admin: ReturnType<typeof createClient> | null = null;
function admin() {
  if (!_admin) {
    _admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );
  }
  return _admin;
}

export interface RateLimitResult {
  allowed: boolean;
  hits: number;
  limit: number;
  remaining: number;
  /** Seconds until the current window rolls over. */
  retry_after: number;
}

/**
 * Count one request against `endpoint` for `userId`.
 *
 * Fails CLOSED: if the limiter itself errors we deny the request rather than
 * hand out uncapped AI spend.
 */
export async function checkRateLimit(
  userId: string,
  endpoint: string,
  limit: number,
  windowSeconds = 60,
): Promise<RateLimitResult> {
  const { data, error } = await admin().rpc("assert_ai_rate_limit", {
    _user_id: userId,
    _endpoint: endpoint,
    _limit: limit,
    _window_seconds: windowSeconds,
  });

  if (error) {
    console.error("assert_ai_rate_limit error", error);
    return { allowed: false, hits: limit, limit, remaining: 0, retry_after: windowSeconds };
  }
  return data as unknown as RateLimitResult;
}

/** Standard 429 body, shared by every AI endpoint. */
export function tooManyRequests(
  result: RateLimitResult,
  corsHeaders: Record<string, string>,
  message = "Too many requests. Please wait a moment and try again.",
) {
  return new Response(
    JSON.stringify({ error: "rate_limited", message, retry_after: result.retry_after }),
    {
      status: 429,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Retry-After": String(result.retry_after),
      },
    },
  );
}
