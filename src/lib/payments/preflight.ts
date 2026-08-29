/**
 * Runtime preflight for the Paddle catalog.
 *
 * The failure this exists to catch is specific and has bitten us before: the
 * client token and the edge functions are perfectly healthy, but the products
 * simply do not exist in the *active* environment yet (typically right after
 * the live token is swapped in, before the catalog has been synced/approved).
 * Checkout then dies inside the Paddle overlay with an opaque error.
 *
 * The preflight resolves every catalog price id up front, so the UI can say
 * "products aren't set up yet" instead of failing at the moment of purchase,
 * and so a structured health line lands in the console/telemetry immediately.
 *
 * Everything except `runPaymentsPreflight` is pure and side-effect free so it
 * can be unit tested without a browser or a network.
 */
import { CREDIT_PACKS, TIERS } from "@/config/tiers";
import { getPaddleEnvironment, isPaymentsConfigured, resolvePaddlePriceIds } from "@/lib/paddle";
import type { PaddleEnvName } from "@/lib/paymentsConfig";

export type PaymentsHealthStatus =
  /** Every catalog price resolved. Checkout is safe to open. */
  | "ok"
  /** Some resolved, some did not — partial catalog, per-plan gating applies. */
  | "partial"
  /** Nothing resolved: the catalog is empty in this environment. */
  | "unavailable"
  /** The resolver itself failed (network, function error). Unknown catalog. */
  | "error"
  /** Payments are not configured at all — nothing to check. */
  | "disabled";

export interface PaymentsPreflight {
  status: PaymentsHealthStatus;
  environment: PaddleEnvName;
  /** Price ids we asked about. */
  checked: string[];
  /** Price ids that resolved to a Paddle `pri_...` id. */
  resolved: string[];
  /** Price ids absent from the active catalog. */
  missing: string[];
  /** Resolver error message, when `status === "error"`. */
  error?: string;
  /** ISO timestamp of the check. */
  checkedAt: string;
  /** Round-trip duration in ms. */
  durationMs: number;
}

/** Every human-readable price id the purchase surfaces can open checkout for. */
export function catalogPriceIds(): string[] {
  return [
    ...TIERS.flatMap((t) => [t.priceId.month, t.priceId.year]),
    ...CREDIT_PACKS.map((p) => p.priceId),
  ];
}

interface SummarizeInput {
  environment: PaddleEnvName;
  checked: string[];
  /** Map of human-readable id -> Paddle `pri_...` id. */
  resolvedMap?: Record<string, string>;
  error?: string;
  configured?: boolean;
  durationMs?: number;
  checkedAt?: string;
}

/** Pure classifier — the whole decision table lives here so tests can pin it. */
export function summarizePreflight(input: SummarizeInput): PaymentsPreflight {
  const checked = [...input.checked];
  const base = {
    environment: input.environment,
    checked,
    checkedAt: input.checkedAt ?? new Date().toISOString(),
    durationMs: input.durationMs ?? 0,
  };

  if (input.configured === false) {
    return { ...base, status: "disabled", resolved: [], missing: checked };
  }
  if (input.error) {
    // A resolver failure tells us nothing about the catalog, so we must not
    // claim the products are missing — that would disable checkout on a blip.
    return { ...base, status: "error", resolved: [], missing: [], error: input.error };
  }

  const resolvedMap = input.resolvedMap ?? {};
  const resolved = checked.filter((id) => typeof resolvedMap[id] === "string" && resolvedMap[id]);
  const missing = checked.filter((id) => !resolved.includes(id));

  const status: PaymentsHealthStatus =
    missing.length === 0 ? "ok" : resolved.length === 0 ? "unavailable" : "partial";

  return { ...base, status, resolved, missing };
}

/** True when this price id cannot be purchased right now. */
export function isPriceUnavailable(preflight: PaymentsPreflight | null, priceId: string): boolean {
  // Only a *known* missing id blocks a CTA. `error`/`disabled`/still-loading
  // must never disable buttons: a transient resolver hiccup blocking every
  // upgrade is far worse than an overlay that fails once and offers a retry.
  if (!preflight) return false;
  if (preflight.status !== "unavailable" && preflight.status !== "partial") return false;
  return preflight.missing.includes(priceId);
}

/** One-line human summary, used by the admin page and the structured log. */
export function preflightMessage(p: PaymentsPreflight): string {
  switch (p.status) {
    case "ok":
      return `All ${p.checked.length} catalog prices resolved in the ${p.environment} catalog.`;
    case "partial":
      return `${p.missing.length} of ${p.checked.length} prices are missing from the ${p.environment} catalog: ${p.missing.join(", ")}.`;
    case "unavailable":
      return `No prices exist in the ${p.environment} catalog yet — products have not been set up or synced.`;
    case "error":
      return `Could not reach the price resolver: ${p.error ?? "unknown error"}.`;
    case "disabled":
      return "Payments are not configured in this build, so the catalog was not checked.";
  }
}

/**
 * Structured health line.
 *
 * Deliberately `console.info` / `console.warn` and never `console.error`: a
 * catalog that is not seeded yet is an operational state we report, not a
 * JavaScript fault, and our route smoke tests fail the build on console
 * errors. Severity is carried in the payload, not in the console channel.
 */
export function logPreflight(p: PaymentsPreflight): void {
  const payload = {
    scope: "payments.preflight",
    status: p.status,
    environment: p.environment,
    checked: p.checked.length,
    resolved: p.resolved.length,
    missing: p.missing,
    durationMs: p.durationMs,
    checkedAt: p.checkedAt,
    message: preflightMessage(p),
  };
  const line = `[payments:preflight] ${payload.status} ${JSON.stringify(payload)}`;
  if (p.status === "ok" || p.status === "disabled") console.info(line);
  else console.warn(line);
}

/** Resolves the whole catalog and logs a structured health status. */
export async function runPaymentsPreflight(
  priceIds: string[] = catalogPriceIds(),
): Promise<PaymentsPreflight> {
  const environment = getPaddleEnvironment();
  const startedAt = Date.now();

  if (!isPaymentsConfigured()) {
    const result = summarizePreflight({ environment, checked: priceIds, configured: false });
    logPreflight(result);
    return result;
  }

  try {
    const resolvedMap = await resolvePaddlePriceIds(priceIds);
    const result = summarizePreflight({
      environment,
      checked: priceIds,
      resolvedMap,
      durationMs: Date.now() - startedAt,
    });
    logPreflight(result);
    return result;
  } catch (err) {
    const result = summarizePreflight({
      environment,
      checked: priceIds,
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - startedAt,
    });
    logPreflight(result);
    return result;
  }
}
