import type { BillingProvider } from "./types";
import { paddleBillingProvider } from "./paddleProvider";
import { revenueCatBillingProvider } from "./revenuecatProvider";

export * from "./types";

const configured = (import.meta.env.VITE_PAYMENT_PROVIDER ?? "paddle").toLowerCase();

/** Single switch for the whole app: built-in payments (default) or revenuecat. */
export const billingService: BillingProvider =
  configured === "revenuecat" ? revenueCatBillingProvider : paddleBillingProvider;

export const activeBillingProvider = billingService.id;
