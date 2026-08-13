import { supabase } from "@/integrations/supabase/client";
import { getPaddle, getPaddleEnvironment, getPaddlePriceId } from "@/lib/paddle";
import { resolveCheckoutDiscount } from "@/hooks/useEligibility";
import type {
  BillingProvider,
  CheckoutRequest,
  CheckoutResult,
  PackCheckoutRequest,
} from "./types";

/**
 * Human-readable price IDs in the payments catalog, derived from the single
 * pricing source of truth so checkout can never drift from the displayed price.
 */
const PLAN_PRICE_IDS: Record<string, string> = Object.fromEntries(
  PAID_PLAN_IDS.flatMap((id) => {
    const ids = PLAN_PRICING[id].priceId!;
    return [
      [`${id}-monthly`, ids.monthly],
      [`${id}-annual`, ids.annual],
    ];
  }),
);


/** Opens the Paddle overlay for one human-readable price ID. */
export async function openPaddleCheckout(
  priceId: string,
  successPath: string,
  discountId?: string | null,
): Promise<CheckoutResult> {
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) throw new Error("Sign in before making a purchase.");

  const paddle = await getPaddle();
  const paddlePriceId = await getPaddlePriceId(priceId);

  paddle.Checkout.open({
    items: [{ priceId: paddlePriceId, quantity: 1 }],
    // Prefill the signed-in customer's email.
    customer: user.email ? { email: user.email } : undefined,
    customData: { userId: user.id },
    // Resolved server-side from verified eligibility — the browser never picks
    // a percentage, it only receives an id it is entitled to.
    ...(discountId ? { discountId } : {}),
    settings: {
      displayMode: "overlay",
      variant: "one-page",
      allowLogout: false,
      successUrl: `${window.location.origin}${successPath}`,
      theme: "dark",
    },
  });

  return { completed: false };
}

/** Lovable-managed payments (Paddle) — overlay checkout + hosted customer portal. */
export const paddleBillingProvider: BillingProvider = {
  id: "paddle",

  async createCheckout({ plan, interval }: CheckoutRequest): Promise<CheckoutResult> {
    const priceId = PLAN_PRICE_IDS[`${plan}-${interval}`];
    if (!priceId) throw new Error(`Unknown plan: ${plan} ${interval}`);
    const discount = await resolveCheckoutDiscount(plan, interval);
    return openPaddleCheckout(priceId, "/welcome", discount.discountId ?? null);
  },

  async createPackCheckout({ pack }: PackCheckoutRequest): Promise<CheckoutResult> {
    return openPaddleCheckout(pack, "/welcome?purchase=pack");
  },

  async openCustomerPortal(): Promise<CheckoutResult> {
    const { data, error } = await supabase.functions.invoke("payments-portal", {
      body: { environment: getPaddleEnvironment() },
    });
    if (error || !data?.url) throw new Error("No portal URL returned");
    return { url: data.url as string };
  },

  async syncSubscription() {
    // Entitlements are written by the payments webhook; nothing to pull here.
  },
};
