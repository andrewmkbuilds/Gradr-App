import type { BillingProvider, CheckoutRequest, CheckoutResult, PackCheckoutRequest } from "./types";
import { paddleBillingProvider } from "./paddleProvider";
import { revenueCatBillingProvider } from "./revenuecatProvider";
import { isPaymentsConfigured } from "@/lib/paddle";
import { sandboxFlags } from "@/lib/qa/sandbox/flags";
import { applySimulatedPack, setSimulatedPlan } from "@/lib/qa/sandbox/simulator";

export * from "./types";

const configured = (import.meta.env.VITE_PAYMENT_PROVIDER ?? "paddle").toLowerCase();
const revenueCatKey = import.meta.env.VITE_REVENUECAT_WEB_API_KEY as string | undefined;

const primary: BillingProvider =
  configured === "revenuecat" ? revenueCatBillingProvider : paddleBillingProvider;

/** Secondary provider, only when it is actually configured and isn't primary. */
const secondary: BillingProvider | null =
  primary.id === "paddle" && revenueCatKey ? revenueCatBillingProvider : null;

/** True when the primary payment rail is usable right now. */
export function isPrimaryBillingAvailable(): boolean {
  return primary.id === "paddle" ? isPaymentsConfigured() : Boolean(revenueCatKey);
}

/** True when a checkout can still be attempted through the backup rail. */
export function hasBillingFallback(): boolean {
  return secondary !== null;
}

/**
 * Errors that mean "this rail is down" rather than "this purchase is invalid".
 * Only these trigger the fallback — a user-facing problem (not signed in,
 * unknown plan) must surface as-is instead of bouncing to another provider.
 */
function isRailOutage(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  if (message.includes("sign in")) return false;
  if (message.includes("unknown plan")) return false;
  return (
    message.includes("unavailable") ||
    message.includes("failed to initialize") ||
    message.includes("failed to resolve price") ||
    message.includes("network") ||
    message.includes("load") ||
    message.includes("timeout") ||
    message.includes("fetch")
  );
}

async function withFallback<T>(
  action: (provider: BillingProvider) => Promise<T>,
): Promise<T> {
  try {
    return await action(primary);
  } catch (error) {
    if (secondary && isRailOutage(error)) {
      console.warn(`[billing] ${primary.id} unavailable, falling back to ${secondary.id}`, error);
      return await action(secondary);
    }
    throw error;
  }
}

/**
 * Single switch for the whole app. Every action runs on the primary rail and
 * transparently retries on the backup rail when the primary is genuinely down,
 * so a Paddle outage doesn't turn every upgrade button into a dead end.
 */
export const billingService: BillingProvider = {
  id: primary.id,
  createCheckout: (req: CheckoutRequest): Promise<CheckoutResult> => {
    // QA sandbox: settle the purchase locally instead of opening a provider
    // checkout, so upgrades/downgrades are testable without credentials.
    if (sandboxFlags().payments) {
      setSimulatedPlan(req.plan === "free" ? "free" : req.plan, req.interval);
      return Promise.resolve({ completed: true });
    }
    return withFallback((p) => p.createCheckout(req));
  },
  createPackCheckout: (req: PackCheckoutRequest): Promise<CheckoutResult> => {
    if (sandboxFlags().payments) {
      applySimulatedPack(req.pack);
      return Promise.resolve({ completed: true });
    }
    return withFallback((p) => p.createPackCheckout(req));
  },
  openCustomerPortal: (): Promise<CheckoutResult> => withFallback((p) => p.openCustomerPortal()),
  syncSubscription: (): Promise<void> => withFallback((p) => p.syncSubscription()),
};

export const activeBillingProvider = primary.id;
