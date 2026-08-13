/**
 * Thresholds for the security/reliability alert dashboards.
 *
 * Two signals are watched:
 *
 *  1. Backend (edge) function error rate — the share of `/api/public/*` calls
 *     that ended in a 5xx over a rolling window. A handful of failures on a
 *     low-volume endpoint is noise, so a breach needs both a minimum sample
 *     size and a rate above the threshold.
 *
 *  2. Permission-denied spikes on public routes — visitors hitting Postgres
 *     `permission denied` errors (typically an RLS/grant regression where an
 *     anonymous visitor ends up evaluating `has_role`). Any occurrence that
 *     mentions `has_role` from a signed-out visitor is treated as critical,
 *     because public pages must never invoke it.
 */

export type AlertSeverity = "critical" | "warning" | "ok";

export interface ErrorRateThreshold {
  /** Rolling window in minutes. */
  windowMinutes: number;
  /** Minimum number of calls before a rate is meaningful. */
  minSamples: number;
  /** Fraction of calls (0-1) that trip a warning. */
  warnRate: number;
  /** Fraction of calls (0-1) that trip a critical alert. */
  criticalRate: number;
}

export interface PermissionDeniedThreshold {
  windowMinutes: number;
  /** Total permission-denied events in the window that trip a warning. */
  warnCount: number;
  /** Total permission-denied events in the window that trip a critical alert. */
  criticalCount: number;
  /** Any anonymous `has_role` denial at or above this count is critical. */
  hasRoleCriticalCount: number;
}

export const EDGE_ERROR_RATE: ErrorRateThreshold = {
  windowMinutes: 60,
  minSamples: 20,
  warnRate: 0.02,
  criticalRate: 0.05,
};

/** Per-endpoint overrides for endpoints that are more or less failure-tolerant. */
export const EDGE_ERROR_RATE_OVERRIDES: Record<string, Partial<ErrorRateThreshold>> = {
  // Payments must be effectively perfect — one failing checkout is revenue lost.
  "/api/public/get-paddle-price": { minSamples: 10, warnRate: 0.01, criticalRate: 0.03 },
  "/api/public/payments-webhook": { minSamples: 5, warnRate: 0.01, criticalRate: 0.02 },
  // AI providers are flakier by nature.
  "/api/public/interview-coach": { warnRate: 0.05, criticalRate: 0.12 },
  "/api/public/analyze-resume": { warnRate: 0.05, criticalRate: 0.12 },
};

export const PERMISSION_DENIED: PermissionDeniedThreshold = {
  windowMinutes: 60,
  warnCount: 3,
  criticalCount: 10,
  hasRoleCriticalCount: 1,
};

export function errorRateThresholdFor(endpoint: string): ErrorRateThreshold {
  return { ...EDGE_ERROR_RATE, ...(EDGE_ERROR_RATE_OVERRIDES[endpoint] ?? {}) };
}

export function severityForRate(rate: number, t: ErrorRateThreshold): AlertSeverity {
  if (rate >= t.criticalRate) return "critical";
  if (rate >= t.warnRate) return "warning";
  return "ok";
}
