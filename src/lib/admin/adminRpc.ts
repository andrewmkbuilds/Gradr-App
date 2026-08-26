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

/**
 * Stable id for a *repeatable* read: the same `fn` + `key` always yields the
 * same id for the lifetime of the page, so react-query retries, refetches on
 * focus, and manual "reload" clicks all trace back to one id instead of
 * flooding the audit log with unrelated ones. Bounded so a long admin session
 * with many filter permutations cannot grow the map without limit.
 */
const stableIds = new Map<string, string>();
const STABLE_ID_LIMIT = 200;

export function requestIdFor(fn: string, key: string): string {
  const mapKey = `${fn}:${key}`;
  const existing = stableIds.get(mapKey);
  if (existing) return existing;
  if (stableIds.size >= STABLE_ID_LIMIT) {
    stableIds.delete(stableIds.keys().next().value as string);
  }
  const id = newRequestId(fn);
  stableIds.set(mapKey, id);
  return id;
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

/**
 * User-facing text for a failed admin RPC, always carrying the request id.
 *
 * The id is the join key between what the admin saw and the `admin_rpc_audit`
 * row the server wrote, so a throttled or denied action can be traced without
 * guessing at timestamps.
 */
export function formatAdminRpcError(error: unknown): string {
  if (error instanceof AdminRpcError) {
    return `${error.message} (request id: ${error.requestId})`;
  }
  return error instanceof Error ? error.message : "Something went wrong";
}

/** Pulls a request id back out of a rendered error string (used by tests). */
export function parseRequestId(text: string): string | null {
  const match = /request id:\s*([\w-]+)/i.exec(text);
  return match ? match[1] : null;
}
