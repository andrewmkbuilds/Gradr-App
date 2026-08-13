/**
 * Loads admin-edited endpoint policy overrides into the in-process cache.
 *
 * The rate limiter runs on the hot path of every `/api/public/*` call, so it
 * cannot afford a database round-trip per request. Overrides are therefore
 * refreshed at most once per TTL per isolate: an edit in the admin dashboard
 * takes effect within a minute everywhere, without adding latency.
 */
import { createClient } from "./supabase";
import { setPolicyOverrides, type PolicyOverride } from "./endpointPolicy";

const TTL_MS = 60_000;
let loadedAt = 0;
let inflight: Promise<void> | null = null;

async function load(): Promise<void> {
  const db = createClient(
    process.env["SUPABASE_URL"]!,
    process.env["SUPABASE_SERVICE_ROLE_KEY"]!,
    { auth: { persistSession: false } },
  );
  const { data, error } = await db
    .from("endpoint_policy_overrides")
    .select(
      "endpoint, rate_limit, window_ms, backoff_seconds, max_backoff_seconds, disabled, alert_server_error, alert_rate_limited, alert_auth_rejected, alert_client_error",
    );
  if (error) throw new Error(error.message);
  setPolicyOverrides((data ?? []) as unknown as PolicyOverride[]);
  loadedAt = Date.now();
}

/** Best-effort refresh — a database hiccup must never fail the request. */
export async function ensurePolicyOverrides(): Promise<void> {
  if (Date.now() - loadedAt < TTL_MS) return;
  if (!inflight) {
    inflight = load()
      .catch((err) => {
        console.warn("[policy] override load failed", err);
        // Back off so a broken database does not retry on every request.
        loadedAt = Date.now() - TTL_MS / 2;
      })
      .finally(() => {
        inflight = null;
      });
  }
  await inflight;
}

/** Forces the next request to reload — called right after an admin edit. */
export function invalidatePolicyOverrides(): void {
  loadedAt = 0;
}
