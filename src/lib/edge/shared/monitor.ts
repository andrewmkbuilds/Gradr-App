/**
 * Endpoint-level health monitoring for every `/api/public/*` handler.
 *
 * Wraps a handler so that each call records one row in `api_health_events`
 * (endpoint, status, outcome, latency) and opens/updates a row in
 * `api_health_alerts` when the call fails or is rejected for auth. The admin
 * dashboard reads both tables, so failures and 401s surface immediately.
 *
 * Monitoring must never change the behaviour of the endpoint: every write is
 * best-effort and swallowed on error.
 */
import { createClient } from "./supabase";
import { dispatchAlert, shouldEscalate } from "./alerting";
import { alertThreshold, policyFor } from "./endpointPolicy";
import {
  callerKey,
  checkRateLimit,
  rateLimitHeaders,
  tooManyRequests,
  type RateLimitRule,
} from "./rateLimit";



export type HealthOutcome =
  | "success"
  | "auth_rejected"
  | "rate_limited"
  | "client_error"
  | "server_error";

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

function outcomeFor(status: number): HealthOutcome {
  if (status < 400) return "success";
  if (status === 401 || status === 403) return "auth_rejected";
  if (status === 429) return "rate_limited";
  if (status < 500) return "client_error";
  return "server_error";
}

const ALERTING_OUTCOMES: HealthOutcome[] = ["auth_rejected", "rate_limited", "server_error"];

async function notify(
  alertId: string,
  endpoint: string,
  kind: HealthOutcome,
  message: string,
  occurrences: number,
  firstSeenAt: string,
  isEscalation: boolean,
) {
  // Best-effort: a dead Slack webhook must never turn into a failed request.
  const error = await dispatchAlert(
    { endpoint, kind, message, occurrences, firstSeenAt },
    isEscalation,
  ).catch((err) => (err instanceof Error ? err.message : String(err)));

  await db()
    .from("api_health_alerts")
    .update({ notified_at: new Date().toISOString(), notify_error: error })
    .eq("id", alertId);
}

async function raiseAlert(endpoint: string, kind: HealthOutcome, message: string) {
  // Transient failures are recorded but stay silent until they repeat enough
  // times to look like a real incident for this specific endpoint.
  const threshold = Math.max(1, alertThreshold(endpoint, kind));

  const { data: open } = await db()
    .from("api_health_alerts")
    .select("id, occurrences, first_seen_at, notified_at")
    .eq("endpoint", endpoint)
    .eq("kind", kind)
    .eq("resolved", false)
    .maybeSingle();

  if (open?.id) {
    const occurrences = Number(open.occurrences ?? 0) + 1;
    await db()
      .from("api_health_alerts")
      .update({
        occurrences,
        last_seen_at: new Date().toISOString(),
        message,
      })
      .eq("id", open.id);

    const firstAnnouncement = !open.notified_at && occurrences >= threshold;
    const escalation = Boolean(open.notified_at) && shouldEscalate(occurrences);

    if (firstAnnouncement || escalation) {
      await notify(
        String(open.id),
        endpoint,
        kind,
        message,
        occurrences,
        String(open.first_seen_at ?? new Date().toISOString()),
        escalation,
      );
    }
    return;
  }

  const { data: created } = await db()
    .from("api_health_alerts")
    .insert({ endpoint, kind, message })
    .select("id, first_seen_at")
    .maybeSingle();

  if (created?.id && threshold <= 1) {
    await notify(
      String(created.id),
      endpoint,
      kind,
      message,
      1,
      String(created.first_seen_at ?? new Date().toISOString()),
      false,
    );
  }
}


export async function recordApiHealth(params: {
  endpoint: string;
  method: string;
  status: number;
  durationMs: number;
  errorMessage?: string | null;
  environment?: string | null;
  userId?: string | null;
}): Promise<void> {
  const outcome = outcomeFor(params.status);
  try {
    await db().from("api_health_events").insert({
      endpoint: params.endpoint,
      method: params.method,
      status_code: params.status,
      outcome,
      duration_ms: Math.max(0, Math.round(params.durationMs)),
      error_message: params.errorMessage ?? null,
      environment: params.environment ?? null,
      user_id: params.userId ?? null,
    });

    if (ALERTING_OUTCOMES.includes(outcome)) {
      await raiseAlert(
        params.endpoint,
        outcome,
        params.errorMessage ?? `HTTP ${params.status} on ${params.endpoint}`,
      );
    }
  } catch (err) {
    console.warn("[api-health] record failed", err);
  }
}

/**
 * Wraps a handler with per-endpoint rate limiting, health recording and a safe
 * 500 fallback. Rate-limited calls short-circuit before the handler runs but
 * are still recorded (as `rate_limited`) so abuse shows up on the dashboard.
 */
export function withMonitoring(
  endpoint: string,
  handler: (req: Request) => Promise<Response>,
  options?: { rateLimit?: RateLimitRule | false },
): (req: Request) => Promise<Response> {
  return async (req: Request) => {
    if (req.method === "OPTIONS") return handler(req);

    const started = Date.now();
    let response: Response;
    let errorMessage: string | null = null;

    const rule = options?.rateLimit === false ? null : (options?.rateLimit ?? DEFAULT_RULE);
    const verdict = rule ? checkRateLimit(endpoint, callerKey(req), rule) : null;

    if (verdict && !verdict.allowed) {
      response = tooManyRequests(verdict);
      errorMessage = `Rate limit exceeded (retry in ${verdict.retryAfter}s)`;
    } else {
      try {
        response = await handler(req);
      } catch (err) {
        errorMessage = err instanceof Error ? err.message : String(err);
        console.error(`[api] ${endpoint} threw`, err);
        response = new Response(JSON.stringify({ error: "Internal server error" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (verdict) {
        // Surface budget headers without disturbing the handler's own response.
        const headers = new Headers(response.headers);
        for (const [k, v] of Object.entries(rateLimitHeaders(verdict))) headers.set(k, v);
        response = new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers,
        });
      }
    }

    if (!errorMessage && response.status >= 400) {
      try {
        const text = await response.clone().text();
        errorMessage = text ? text.slice(0, 500) : null;
      } catch {
        errorMessage = null;
      }
    }

    await recordApiHealth({
      endpoint,
      method: req.method,
      status: response.status,
      durationMs: Date.now() - started,
      errorMessage,
      environment: new URL(req.url).searchParams.get("env"),
    });

    return response;
  };
}

