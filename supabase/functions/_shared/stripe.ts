import Stripe from "https://esm.sh/stripe@18.5.0?target=deno";

export const PRICE_CONFIG = {
  monthly: { amount: 1900, interval: "month" as const, label: "CareerFlow OS Pro (Monthly)" },
  annual: { amount: 16800, interval: "year" as const, label: "CareerFlow OS Pro (Annual)" },
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

/** Finds or creates the Stripe price for a Pro plan interval, keyed by lookup_key so it is idempotent. */
export async function ensureProPrice(stripe: Stripe, plan: "monthly" | "annual") {
  const cfg = PRICE_CONFIG[plan];
  const lookupKey = `careerflow_pro_${plan}`;

  const existing = await stripe.prices.list({ lookup_keys: [lookupKey], active: true, limit: 1 });
  if (existing.data.length > 0) return existing.data[0];

  const products = await stripe.products.search({
    query: `metadata['careerflow_product']:'pro'`,
    limit: 1,
  });
  const product =
    products.data[0] ??
    (await stripe.products.create({
      name: "CareerFlow OS Pro",
      description: "Unlimited resume analysis, AI matching, cover letters and interview coaching.",
      metadata: { careerflow_product: "pro" },
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
