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

async function raiseAlert(endpoint: string, kind: HealthOutcome, message: string) {
  const { data: open } = await db()
    .from("api_health_alerts")
    .select("id, occurrences")
    .eq("endpoint", endpoint)
    .eq("kind", kind)
    .eq("resolved", false)
    .maybeSingle();

  if (open?.id) {
    await db()
      .from("api_health_alerts")
      .update({
        occurrences: Number(open.occurrences ?? 0) + 1,
        last_seen_at: new Date().toISOString(),
        message,
      })
      .eq("id", open.id);
    return;
  }

  await db().from("api_health_alerts").insert({ endpoint, kind, message });
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

/** Wraps a handler with health recording and a safe 500 fallback. */
export function withMonitoring(
  endpoint: string,
  handler: (req: Request) => Promise<Response>,
): (req: Request) => Promise<Response> {
  return async (req: Request) => {
    if (req.method === "OPTIONS") return handler(req);

    const started = Date.now();
    let response: Response;
    let errorMessage: string | null = null;

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
