import type { BillingProvider, CheckoutRequest, PackCheckoutRequest } from "./types";

/**
 * RevenueCat Web Billing fallback.
 *
 * Stripe is the active provider, so this implementation is intentionally a thin
 * stub: it satisfies the BillingProvider contract and documents exactly which
 * calls need wiring if the project ever switches with
 * `VITE_PAYMENT_PROVIDER=revenuecat`.
 *
 * To activate: `bun add @revenuecat/purchases-js`, configure with the Web
 * Billing public key, then replace each method body with the matching
 * Purchases.getSharedInstance() call. Entitlement checks stay server-side via
 * the same `subscribers` table, so no other app code changes.
 */
const NOT_WIRED =
  "RevenueCat fallback is not active. Set VITE_PAYMENT_PROVIDER=stripe or complete the RevenueCat Web Billing wiring.";

export const revenueCatBillingProvider: BillingProvider = {
  id: "revenuecat",

  async createCheckout(_req: CheckoutRequest) {
    throw new Error(NOT_WIRED);
  },

  async createPackCheckout(_req: PackCheckoutRequest) {
    throw new Error(NOT_WIRED);
  },

  async openCustomerPortal() {
    throw new Error(NOT_WIRED);
  },

  async syncSubscription() {
    throw new Error(NOT_WIRED);
  },
};
