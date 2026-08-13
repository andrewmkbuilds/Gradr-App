/**
 * Per-endpoint rate limiting with exponential backoff.
 *
 * In-memory token bucket keyed by `endpoint + caller` (forwarded IP, falling
 * back to the CF connecting IP or a shared bucket). Each isolate keeps its own
 * counters, which is the right trade-off here: it is cheap, adds no database
 * round-trip on the hot path, and still shields downstream providers from a
 * single hot caller.
 *
 * Callers that keep hammering after a rejection get an exponentially growing
 * cool-down (`base * 2^strikes`, capped), surfaced through `Retry-After`.
 */

export interface RateLimitRule {
  /** Requests allowed per window. */
  limit: number;
  /** Sliding window length in milliseconds. */
  windowMs: number;
  /** First cool-down applied after a rejection, in seconds. */
  backoffSeconds?: number;
  /** Upper bound for the exponential cool-down, in seconds. */
  maxBackoffSeconds?: number;
}

export const DEFAULT_RULE: RateLimitRule = {
  limit: 60,
  windowMs: 60_000,
  backoffSeconds: 5,
  maxBackoffSeconds: 300,
};

interface Bucket {
  hits: number[];
  strikes: number;
  blockedUntil: number;
}

const buckets = new Map<string, Bucket>();
let lastSweep = 0;

function sweep(now: number) {
  // Cheap opportunistic GC so long-lived isolates don't grow unbounded.
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    const idle =
      bucket.blockedUntil < now && (bucket.hits[bucket.hits.length - 1] ?? 0) < now - 600_000;
    if (idle) buckets.delete(key);
  }
}

export function callerKey(req: Request): string {
  const headers = req.headers;
  const forwarded = headers.get("x-forwarded-for");
  const ip =
    forwarded?.split(",")[0]?.trim() ||
    headers.get("cf-connecting-ip") ||
    headers.get("x-real-ip") ||
    "anonymous";
  return ip;
}

export interface RateLimitVerdict {
  allowed: boolean;
  remaining: number;
  /** Seconds the caller should wait before retrying (only when blocked). */
  retryAfter: number;
  limit: number;
  resetSeconds: number;
}

export function checkRateLimit(
  endpoint: string,
  caller: string,
  rule: RateLimitRule = DEFAULT_RULE,
): RateLimitVerdict {
  const now = Date.now();
  sweep(now);

  const base = rule.backoffSeconds ?? DEFAULT_RULE.backoffSeconds!;
  const max = rule.maxBackoffSeconds ?? DEFAULT_RULE.maxBackoffSeconds!;
  const key = `${endpoint}::${caller}`;
  const bucket = buckets.get(key) ?? { hits: [], strikes: 0, blockedUntil: 0 };
  buckets.set(key, bucket);

  if (bucket.blockedUntil > now) {
    return {
      allowed: false,
      remaining: 0,
      retryAfter: Math.ceil((bucket.blockedUntil - now) / 1000),
      limit: rule.limit,
      resetSeconds: Math.ceil((bucket.blockedUntil - now) / 1000),
    };
  }

  bucket.hits = bucket.hits.filter((t) => t > now - rule.windowMs);

  if (bucket.hits.length >= rule.limit) {
    bucket.strikes += 1;
    const wait = Math.min(max, base * 2 ** (bucket.strikes - 1));
    bucket.blockedUntil = now + wait * 1000;
    return {
      allowed: false,
      remaining: 0,
      retryAfter: wait,
      limit: rule.limit,
      resetSeconds: wait,
    };
  }

  bucket.hits.push(now);
  // A clean window forgives past strikes so honest callers reset their backoff.
  if (bucket.hits.length === 1) bucket.strikes = 0;

  const oldest = bucket.hits[0] ?? now;
  return {
    allowed: true,
    remaining: Math.max(0, rule.limit - bucket.hits.length),
    retryAfter: 0,
    limit: rule.limit,
    resetSeconds: Math.ceil((oldest + rule.windowMs - now) / 1000),
  };
}

export function rateLimitHeaders(verdict: RateLimitVerdict): Record<string, string> {
  const headers: Record<string, string> = {
    "X-RateLimit-Limit": String(verdict.limit),
    "X-RateLimit-Remaining": String(verdict.remaining),
    "X-RateLimit-Reset": String(verdict.resetSeconds),
  };
  if (!verdict.allowed) headers["Retry-After"] = String(verdict.retryAfter);
  return headers;
}

export function tooManyRequests(verdict: RateLimitVerdict): Response {
  return new Response(
    JSON.stringify({
      error: "Too many requests",
      retryAfter: verdict.retryAfter,
    }),
    {
      status: 429,
      headers: { "Content-Type": "application/json", ...rateLimitHeaders(verdict) },
    },
  );
}

/** Test/ops helper — clears all in-memory counters for this isolate. */
export function resetRateLimits() {
  buckets.clear();
}
