/** Provider-agnostic billing contracts. The app only talks to these types. */

export type PlanInterval = "monthly" | "annual";
export type PlanKey = "free" | "starter" | "pro";

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
 * Every billing action in the app routes through this interface.
 * Swapping StripeBillingProvider for RevenueCatBillingProvider requires no
 * changes outside `src/lib/billing`.
 */
export interface BillingProvider {
  readonly id: "stripe" | "revenuecat";
  /** Start a subscription checkout; returns a URL to redirect/open. */
  createCheckout(req: CheckoutRequest): Promise<{ url: string }>;
  /** Start a one-off credit pack checkout. */
  createPackCheckout(req: PackCheckoutRequest): Promise<{ url: string }>;
  /** Open the self-serve management surface (upgrade/downgrade/cancel/resume/card). */
  openCustomerPortal(): Promise<{ url: string }>;
  /** Re-sync entitlements from the provider into the database. */
  syncSubscription(): Promise<void>;
}

export const PLAN_CATALOG: Record<
  Exclude<PlanKey, "free">,
  { label: string; monthly: number; annual: number }
> = {
  starter: { label: "Starter", monthly: 900, annual: 8400 },
  pro: { label: "Pro", monthly: 1900, annual: 16800 },
};
