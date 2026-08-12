import { supabase } from "@/integrations/supabase/client";
import { getPaddle, getPaddleEnvironment, getPaddlePriceId } from "@/lib/paddle";
import type {
  BillingProvider,
  CheckoutRequest,
  CheckoutResult,
  PackCheckoutRequest,
} from "./types";

/** Human-readable price IDs in the payments catalog. */
const PLAN_PRICE_IDS: Record<string, string> = {
  "starter-monthly": "starter_monthly",
  "starter-annual": "starter_annual",
  "pro-monthly": "pro_monthly",
  "pro-annual": "pro_annual",
  "advanced-monthly": "advanced_monthly",
  "advanced-annual": "advanced_annual",
};

/** Opens the Paddle overlay for one human-readable price ID. */
export async function openPaddleCheckout(
  priceId: string,
  successPath: string,
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
    return openPaddleCheckout(priceId, "/welcome");
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
