/**
 * Per-endpoint reliability policy: rate limiting, backoff and alert noise.
 *
 * One place to answer two questions for any `/api/public/*` endpoint:
 *
 *   1. How many calls per caller per window, and how hard do we back off when
 *      somebody keeps hammering after a rejection?
 *   2. How many failures of a given kind must pile up before a human is paged?
 *
 * Expensive AI/provider endpoints get tight buckets with long cool-downs.
 * Webhooks and cron callers get generous buckets (they are authenticated and
 * bursty, and throttling them causes retries, not relief). Everything else
 * falls back to a sane default.
 *
 * Alert thresholds exist because transient errors are normal: a single 5xx
 * from a flaky provider, or one 429 during a burst, should be *recorded* on
 * the dashboard but must not fire Slack/email. Only sustained failure does.
 */
import { DEFAULT_RULE, type RateLimitRule } from "./rateLimit";

export type AlertKind =
  | "auth_rejected"
  | "rate_limited"
  | "client_error"
  | "server_error";

export interface EndpointPolicy {
  /** `false` disables limiting entirely (used for provider webhooks). */
  rateLimit: RateLimitRule | false;
  /**
   * Occurrences of a failure kind required before the alert is announced.
   * Below the threshold the incident is still tracked in `api_health_alerts`
   * so the dashboard shows it — it just stays quiet.
   */
  alertAfter: Partial<Record<AlertKind, number>>;
}

/** Sensible baseline for an ordinary authenticated JSON endpoint. */
const DEFAULT_ALERT_AFTER: Record<AlertKind, number> = {
  // A couple of 401s is someone with a stale token, not an incident.
  auth_rejected: 10,
  // Rate limiting is the system working; only sustained throttling matters.
  rate_limited: 20,
  client_error: 25,
  // Transient provider blips are absorbed; three in a row is a real problem.
  server_error: 3,
};

export const DEFAULT_POLICY: EndpointPolicy = {
  rateLimit: DEFAULT_RULE,
  alertAfter: DEFAULT_ALERT_AFTER,
};

/** Costly AI / scraping calls: small bucket, long exponential cool-down. */
const AI_RULE: RateLimitRule = {
  limit: 12,
  windowMs: 60_000,
  backoffSeconds: 20,
  maxBackoffSeconds: 600,
};

/** Cheap reads that a page may call several times while it settles. */
const READ_RULE: RateLimitRule = {
  limit: 120,
  windowMs: 60_000,
  backoffSeconds: 3,
  maxBackoffSeconds: 60,
};

/** Admin tooling: one operator, but bursty (replays, exports). */
const ADMIN_RULE: RateLimitRule = {
  limit: 60,
  windowMs: 60_000,
  backoffSeconds: 5,
  maxBackoffSeconds: 120,
};

const POLICIES: Record<string, EndpointPolicy> = {
  // ---- AI + provider-backed work -------------------------------------
  "/api/public/analyze-resume": { rateLimit: AI_RULE, alertAfter: DEFAULT_ALERT_AFTER },
  "/api/public/match-jobs": { rateLimit: AI_RULE, alertAfter: DEFAULT_ALERT_AFTER },
  "/api/public/generate-application": { rateLimit: AI_RULE, alertAfter: DEFAULT_ALERT_AFTER },
  "/api/public/interview-coach": {
    rateLimit: { limit: 30, windowMs: 60_000, backoffSeconds: 10, maxBackoffSeconds: 300 },
    alertAfter: { ...DEFAULT_ALERT_AFTER, server_error: 5 },
  },
  "/api/public/interview-report": { rateLimit: AI_RULE, alertAfter: DEFAULT_ALERT_AFTER },
  "/api/public/interview-voice": {
    rateLimit: { limit: 60, windowMs: 60_000, backoffSeconds: 5, maxBackoffSeconds: 120 },
    alertAfter: { ...DEFAULT_ALERT_AFTER, server_error: 5 },
  },
  "/api/public/career-plan": { rateLimit: AI_RULE, alertAfter: DEFAULT_ALERT_AFTER },
  "/api/public/practice-plan": { rateLimit: AI_RULE, alertAfter: DEFAULT_ALERT_AFTER },
  "/api/public/company-research": { rateLimit: AI_RULE, alertAfter: DEFAULT_ALERT_AFTER },
  "/api/public/parse-job-url": { rateLimit: AI_RULE, alertAfter: DEFAULT_ALERT_AFTER },
  "/api/public/recommend-jobs": { rateLimit: AI_RULE, alertAfter: DEFAULT_ALERT_AFTER },
  "/api/public/jobs-apify": { rateLimit: AI_RULE, alertAfter: DEFAULT_ALERT_AFTER },
  "/api/public/search-jobs": {
    rateLimit: { limit: 40, windowMs: 60_000, backoffSeconds: 10, maxBackoffSeconds: 300 },
    alertAfter: DEFAULT_ALERT_AFTER,
  },

  // ---- Cheap reads ----------------------------------------------------
  "/api/public/get-paddle-price": { rateLimit: READ_RULE, alertAfter: DEFAULT_ALERT_AFTER },
  "/api/public/resolve-discount": { rateLimit: READ_RULE, alertAfter: DEFAULT_ALERT_AFTER },
  "/api/public/affiliate-public": { rateLimit: READ_RULE, alertAfter: DEFAULT_ALERT_AFTER },

  // ---- Provider webhooks: never throttle, retries make it worse -------
  "/api/public/payments-webhook": {
    rateLimit: false,
    // Paddle retries; a single failed delivery is expected noise.
    alertAfter: { ...DEFAULT_ALERT_AFTER, server_error: 3, auth_rejected: 3 },
  },
  "/api/public/revenuecat-sync": {
    rateLimit: false,
    alertAfter: { ...DEFAULT_ALERT_AFTER, server_error: 3, auth_rejected: 3 },
  },

  // ---- Cron / scheduled -----------------------------------------------
  "/api/public/daily-digest": {
    rateLimit: { limit: 10, windowMs: 60_000, backoffSeconds: 30, maxBackoffSeconds: 600 },
    // Cron runs rarely — two consecutive failures is already a missed digest.
    alertAfter: { ...DEFAULT_ALERT_AFTER, server_error: 2 },
  },
  "/api/public/seo-monitor": {
    rateLimit: { limit: 10, windowMs: 60_000, backoffSeconds: 30, maxBackoffSeconds: 600 },
    alertAfter: { ...DEFAULT_ALERT_AFTER, server_error: 2 },
  },

  // ---- Admin tooling ---------------------------------------------------
  "/api/public/admin-rpc": { rateLimit: ADMIN_RULE, alertAfter: DEFAULT_ALERT_AFTER },
  "/api/public/admin-webhook-replay": { rateLimit: ADMIN_RULE, alertAfter: DEFAULT_ALERT_AFTER },
  "/api/public/admin-webhook-simulate": { rateLimit: ADMIN_RULE, alertAfter: DEFAULT_ALERT_AFTER },
  "/api/public/admin-email-ops": { rateLimit: ADMIN_RULE, alertAfter: DEFAULT_ALERT_AFTER },

  // ---- Destructive / sensitive ----------------------------------------
  "/api/public/delete-account": {
    rateLimit: { limit: 3, windowMs: 300_000, backoffSeconds: 60, maxBackoffSeconds: 900 },
    alertAfter: { ...DEFAULT_ALERT_AFTER, auth_rejected: 3 },
  },
  "/api/public/send-notification": {
    rateLimit: { limit: 30, windowMs: 60_000, backoffSeconds: 15, maxBackoffSeconds: 300 },
    alertAfter: DEFAULT_ALERT_AFTER,
  },
};

export function policyFor(endpoint: string): EndpointPolicy {
  return POLICIES[endpoint] ?? DEFAULT_POLICY;
}

/**
 * Every explicitly configured endpoint, for the admin policy viewer.
 * Endpoints absent from this list fall back to {@link DEFAULT_POLICY}.
 */
export function listPolicies(): { endpoint: string; policy: EndpointPolicy }[] {
  return Object.entries(POLICIES)
    .map(([endpoint, policy]) => ({ endpoint, policy }))
    .sort((a, b) => a.endpoint.localeCompare(b.endpoint));
}

/** How many occurrences before this incident is worth announcing. */
export function alertThreshold(endpoint: string, kind: string): number {
  const policy = policyFor(endpoint);
  return (
    policy.alertAfter[kind as AlertKind] ??
    DEFAULT_ALERT_AFTER[kind as AlertKind] ??
    1
  );
}
