import Stripe from "https://esm.sh/stripe@18.5.0?target=deno";

export type PlanTier = "starter" | "pro";
export type PlanInterval = "monthly" | "annual";

export const PRICE_CONFIG: Record<
  PlanTier,
  Record<PlanInterval, { amount: number; interval: "month" | "year"; label: string }>
> = {
  starter: {
    monthly: { amount: 900, interval: "month", label: "CareerFlow OS Starter (Monthly)" },
    annual: { amount: 8400, interval: "year", label: "CareerFlow OS Starter (Annual)" },
  },
  pro: {
    monthly: { amount: 1900, interval: "month", label: "CareerFlow OS Pro (Monthly)" },
    annual: { amount: 16800, interval: "year", label: "CareerFlow OS Pro (Annual)" },
  },
};


export const PACKS: Record<
  string,
  { label: string; amount: number; credits: number; kind: "application" | "interview" }
> = {
  applications_10: {
    label: "10 Extra Applications",
    amount: 900,
    credits: 10,
    kind: "application",
  },
  applications_25: {
    label: "25 Extra Applications",
    amount: 1900,
    credits: 25,
    kind: "application",
  },
  interview_pack_3: {
    label: "Interview Prep Pack (3 sessions)",
    amount: 1200,
    credits: 3,
    kind: "interview",
  },
  interview_pack_10: {
    label: "Interview Prep Pack (10 sessions)",
    amount: 3400,
    credits: 10,
    kind: "interview",
  },
};

export function getStripe(): Stripe {
  const key = Deno.env.get("STRIPE_SECRET_KEY");
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured");
  return new Stripe(key, { apiVersion: "2025-08-27.basil", httpClient: Stripe.createFetchHttpClient() });
}

const PRODUCT_META: Record<PlanTier, { name: string; description: string }> = {
  starter: {
    name: "CareerFlow OS Starter",
    description: "Core resume analysis, ATS scoring and job matching for early job seekers.",
  },
  pro: {
    name: "CareerFlow OS Pro",
    description: "Unlimited resume analysis, AI matching, cover letters and interview coaching.",
  },
};

/** Finds or creates the Stripe price for a tier + interval, keyed by lookup_key so it is idempotent. */
export async function ensurePlanPrice(stripe: Stripe, tier: PlanTier, plan: PlanInterval) {
  const cfg = PRICE_CONFIG[tier][plan];
  const lookupKey = `careerflow_${tier}_${plan}`;

  const existing = await stripe.prices.list({ lookup_keys: [lookupKey], active: true, limit: 1 });
  if (existing.data.length > 0) return existing.data[0];

  const products = await stripe.products.search({
    query: `metadata['careerflow_product']:'${tier}'`,
    limit: 1,
  });
  const product =
    products.data[0] ??
    (await stripe.products.create({
      ...PRODUCT_META[tier],
      metadata: { careerflow_product: tier },
    }));

  return await stripe.prices.create({
    product: product.id,
    unit_amount: cfg.amount,
    currency: "usd",
    recurring: { interval: cfg.interval },
    lookup_key: lookupKey,
    nickname: cfg.label,
  });
}

/**
 * Resolves the plan tier for a subscription from price lookup_key / product metadata /
 * subscription metadata. Never assume "pro" — that promoted every paying user.
 */
export function resolveTier(input: {
  lookupKey?: string | null;
  metadataTier?: string | null;
  productMetadataTier?: string | null;
  amount?: number | null;
}): PlanTier {
  const candidates = [input.metadataTier, input.productMetadataTier, input.lookupKey]
    .filter(Boolean)
    .map((v) => String(v).toLowerCase());
  if (candidates.some((c) => c.includes("starter"))) return "starter";
  if (candidates.some((c) => c.includes("pro"))) return "pro";
  if (input.amount === PRICE_CONFIG.starter.monthly.amount || input.amount === PRICE_CONFIG.starter.annual.amount) {
    return "starter";
  }
  return "pro";
}
