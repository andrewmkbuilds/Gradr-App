import { supabase } from "@/integrations/supabase/client";

/**
 * Request-id propagation for admin RPCs.
 *
 * `public.admin_rpc_guard()` reads `x-request-id` off the PostgREST request
 * headers and stores it on every `admin_rpc_audit` row (allowed, denied, or
 * throttled). Sending our own id means a UI action and its server-side audit
 * entries share one traceable key.
 *
 * Retries matter here: react-query, an explicit "try again" button, and the
 * throttle-then-retry path all re-issue the *same* logical action. Passing the
 * same `requestId` through those retries keeps them grouped under one id
 * instead of scattering across generated ones, which is exactly what makes the
 * audit trail readable after an incident.
 */

/** A short, sortable, human-greppable id: `<action>-<time36>-<rand>`. */
export function newRequestId(action: string): string {
  const slug = action.replace(/[^a-z0-9]+/gi, "-").toLowerCase().slice(0, 24);
  const stamp = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${slug}-${stamp}-${rand}`;
}

export interface AdminRpcOptions {
  /**
   * Reuse across retries of one logical action. Omit and a fresh id is minted
   * per call — fine for one-shot calls, wrong for anything retried.
   */
  requestId?: string;
}

export interface AdminRpcResult<T> {
  data: T | null;
  error: { message: string; code?: string } | null;
  /** The id sent to the server; present on the matching audit rows. */
  requestId: string;
  /** True when the guard rejected the call for exceeding the rate limit. */
  throttled: boolean;
}

/** The guard raises this text when the per-minute limit is exceeded. */
const THROTTLE_MARKER = "rate limit exceeded";

export function isThrottleError(message: string | undefined | null): boolean {
  return !!message && message.toLowerCase().includes(THROTTLE_MARKER);
}

/**
 * Call an admin RPC with a traceable request id.
 *
 * Never throws for an RPC-level failure — callers branch on `error` /
 * `throttled` so a throttled call can surface its own message instead of
 * looking like a generic outage.
 */
export async function adminRpc<T = unknown>(
  fn: string,
  args?: Record<string, unknown>,
  options: AdminRpcOptions = {},
): Promise<AdminRpcResult<T>> {
  const requestId = options.requestId ?? newRequestId(fn);

  // `setHeader` is per-request on the PostgREST builder, so this does not leak
  // the id into unrelated queries sharing the same client.
  const builder = supabase
    // deno-lint-ignore no-explicit-any
    .rpc(fn as never, (args ?? {}) as never)
    .setHeader("x-request-id", requestId);

  const { data, error } = await builder;

  return {
    data: (data ?? null) as T | null,
    error: error ? { message: error.message, code: error.code } : null,
    requestId,
    throttled: isThrottleError(error?.message),
  };
}

/**
 * Same as `adminRpc`, but throws on failure — for call sites already wrapped in
 * react-query, where a rejected promise is the error channel. The thrown error
 * carries `requestId` and `throttled` so the UI can still show both.
 */
export class AdminRpcError extends Error {
  requestId: string;
  throttled: boolean;
  code?: string;

  constructor(message: string, requestId: string, throttled: boolean, code?: string) {
    super(message);
    this.name = "AdminRpcError";
    this.requestId = requestId;
    this.throttled = throttled;
    this.code = code;
  }
}

export async function adminRpcOrThrow<T = unknown>(
  fn: string,
  args?: Record<string, unknown>,
  options: AdminRpcOptions = {},
): Promise<T> {
  const result = await adminRpc<T>(fn, args, options);
  if (result.error) {
    throw new AdminRpcError(
      result.throttled
        ? "Too many admin requests — the server is throttling this action. Wait a minute and try again."
        : result.error.message,
      result.requestId,
      result.throttled,
      result.error.code,
    );
  }
  return result.data as T;
}
