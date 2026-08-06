import { supabase } from "@/integrations/supabase/client";
import type {
  BillingProvider,
  CheckoutRequest,
  CheckoutResult,
  PackCheckoutRequest,
} from "./types";

async function invoke<T>(fn: string, body?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(fn, body ? { body } : undefined);
  if (error) throw error;
  return data as T;
}

/** Native Stripe (Checkout + Billing + Customer Portal) via edge functions. */
export const stripeBillingProvider: BillingProvider = {
  id: "stripe",

  async createCheckout({ plan, interval }: CheckoutRequest): Promise<CheckoutResult> {
    const data = await invoke<{ url?: string }>("create-checkout", {
      mode: "subscription",
      plan: interval,
      tier: plan,
    });
    if (!data?.url) throw new Error("No checkout URL returned");
    return { url: data.url };
  },

  async createPackCheckout({ pack }: PackCheckoutRequest): Promise<CheckoutResult> {
    const data = await invoke<{ url?: string }>("create-checkout", { mode: "payment", pack });
    if (!data?.url) throw new Error("No checkout URL returned");
    return { url: data.url };
  },

  async openCustomerPortal(): Promise<CheckoutResult> {
    const data = await invoke<{ url?: string }>("customer-portal");
    if (!data?.url) throw new Error("No portal URL returned");
    return { url: data.url };
  },

  async syncSubscription() {
    await invoke("check-subscription");
  },
};
