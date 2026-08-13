/**
 * SINGLE SOURCE OF TRUTH for Gradr plan pricing.
 *
 * Every surface (pricing page, landing page, billing page, upgrade prompts,
 * emails, checkout) reads its numbers from here. The amounts below are the USD
 * list prices in MINOR units and must stay identical to the Paddle catalog
 * (external price IDs `starter_monthly`, `starter_annual`, ...).
 *
 * Yearly prices are FLAT list prices — never monthly x 12.
 */

export type PlanId = "free" | "starter" | "pro" | "advanced";
export type BillingInterval = "monthly" | "annual";

export interface PlanPricing {
  id: PlanId;
  name: string;
  /** USD minor units charged per month on the monthly plan. */
  monthly: number;
  /** USD minor units charged per year on the yearly plan (flat, not x12). */
  annual: number;
  /** Paddle external price IDs. `null` for the free plan (no checkout). */
  priceId: { monthly: string; annual: string } | null;
}

export const PLAN_PRICING: Record<PlanId, PlanPricing> = {
  free: { id: "free", name: "Free", monthly: 0, annual: 0, priceId: null },
  starter: {
    id: "starter",
    name: "Starter",
    monthly: 900,
    annual: 8000,
    priceId: { monthly: "starter_monthly", annual: "starter_annual" },
  },
  pro: {
    id: "pro",
    name: "Pro",
    monthly: 1900,
    annual: 16000,
    priceId: { monthly: "pro_monthly", annual: "pro_annual" },
  },
  advanced: {
    id: "advanced",
    name: "Advanced",
    monthly: 2900,
    annual: 26000,
    priceId: { monthly: "advanced_monthly", annual: "advanced_annual" },
  },
};

export const PAID_PLAN_IDS = ["starter", "pro", "advanced"] as const satisfies readonly PlanId[];

/** Amount charged for a plan on a given interval, in USD minor units. */
export function planAmount(plan: PlanId, interval: BillingInterval): number {
  const p = PLAN_PRICING[plan];
  return interval === "annual" ? p.annual : p.monthly;
}

/** `$9`, `$80`, `$0` — whole dollars when the amount has no cents. */
export function formatUsd(minor: number): string {
  const dollars = minor / 100;
  return dollars % 1 === 0 ? `$${dollars}` : `$${dollars.toFixed(2)}`;
}

/** What 12 months of the monthly plan would cost — the yearly "was" price. */
export function annualListPrice(plan: PlanId): number {
  return PLAN_PRICING[plan].monthly * 12;
}

/** Whole-percent savings of yearly vs. 12x monthly. 0 for the free plan. */
export function annualSavingsPercent(plan: PlanId): number {
  const list = annualListPrice(plan);
  if (list <= 0) return 0;
  return Math.round(((list - PLAN_PRICING[plan].annual) / list) * 100);
}

/** Highest yearly saving across paid plans — powers "Save up to 30%". */
export const MAX_ANNUAL_SAVINGS_PERCENT = Math.max(
  ...PAID_PLAN_IDS.map((id) => annualSavingsPercent(id)),
);

export const ANNUAL_SAVINGS_MESSAGE = `Save up to ${MAX_ANNUAL_SAVINGS_PERCENT}% with yearly billing`;

/** "/ month", "/ year", "/ forever" suffix for a plan + interval. */
export function billingPeriodLabel(plan: PlanId, interval: BillingInterval): string {
  if (plan === "free") return "forever";
  return interval === "annual" ? "year" : "month";
}

/** Display price for a plan + interval, e.g. `$160`. */
export function planPriceLabel(plan: PlanId, interval: BillingInterval): string {
  return formatUsd(planAmount(plan, interval));
}
