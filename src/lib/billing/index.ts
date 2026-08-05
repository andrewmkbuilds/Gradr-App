import type { BillingProvider } from "./types";
import { stripeBillingProvider } from "./stripeProvider";
import { revenueCatBillingProvider } from "./revenuecatProvider";

export * from "./types";

const configured = (import.meta.env.VITE_PAYMENT_PROVIDER ?? "stripe").toLowerCase();

/** Single switch for the whole app: stripe (default) or revenuecat. */
export const billingService: BillingProvider =
  configured === "revenuecat" ? revenueCatBillingProvider : stripeBillingProvider;

export const activeBillingProvider = billingService.id;
