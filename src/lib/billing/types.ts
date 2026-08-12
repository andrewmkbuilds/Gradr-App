/** Provider-agnostic billing contracts. The app only talks to these types. */

export type PlanInterval = "monthly" | "annual";
export type PlanKey = "free" | "starter" | "pro" | "advanced";

export interface SubscriptionSnapshot {
  subscribed: boolean;
  tier: string | null;
  status: string | null;
  billingInterval: PlanInterval | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

export interface CheckoutRequest {
  plan: PlanKey;
  interval: PlanInterval;
}

export interface PackCheckoutRequest {
  pack: string;
}

/**
 * Result of a checkout action.
 * - Hosted providers (Stripe) return a `url` the app opens in a new tab.
 * - In-page providers (RevenueCat Web Billing) complete inline and return
 *   `completed: true` with no URL.
 */
export interface CheckoutResult {
  url?: string;
  completed?: boolean;
}

/**
 * Every billing action in the app routes through this interface.
 * Swapping StripeBillingProvider for RevenueCatBillingProvider requires no
 * changes outside `src/lib/billing`.
 */
export interface BillingProvider {
  readonly id: "paddle" | "revenuecat";
  /** Start a subscription checkout. */
  createCheckout(req: CheckoutRequest): Promise<CheckoutResult>;
  /** Start a one-off credit pack checkout. */
  createPackCheckout(req: PackCheckoutRequest): Promise<CheckoutResult>;
  /** Open the self-serve management surface (upgrade/downgrade/cancel/resume/card). */
  openCustomerPortal(): Promise<CheckoutResult>;
  /** Re-sync entitlements from the provider into the database. */
  syncSubscription(): Promise<void>;
}

export const PLAN_CATALOG: Record<
  Exclude<PlanKey, "free">,
  { label: string; monthly: number; annual: number }
> = {
  starter: { label: "Starter", monthly: 900, annual: 8400 },
  pro: { label: "Pro", monthly: 1900, annual: 16800 },
  advanced: { label: "Advanced", monthly: 2900, annual: 26400 },
};

/** Entitlement identifier shared by both providers. */
export const PRO_ENTITLEMENT = "CareerFlow OS Pro";
