import { supabase } from "@/integrations/supabase/client";
import {
  PRO_ENTITLEMENT,
  type BillingProvider,
  type CheckoutRequest,
  type CheckoutResult,
  type PackCheckoutRequest,
} from "./types";

/**
 * RevenueCat Web Billing provider.
 *
 * Activated with `VITE_PAYMENT_PROVIDER=revenuecat`. Requires
 * `VITE_REVENUECAT_WEB_API_KEY` (RevenueCat Web Billing public key — safe in
 * the client). Entitlement truth still lands in the `subscribers` table via the
 * `revenuecat-webhook` edge function, so every gating check in the app is
 * unchanged regardless of provider.
 *
 * Offering packages expected in the RevenueCat dashboard:
 *   monthly | yearly | lifetime  (plus `starter_monthly` / `starter_yearly`)
 * Credit packs map 1:1 to RevenueCat product identifiers.
 */

const API_KEY = import.meta.env.VITE_REVENUECAT_WEB_API_KEY as string | undefined;

type PurchasesModule = typeof import("@revenuecat/purchases-js");

let modPromise: Promise<PurchasesModule> | null = null;
let configuredFor: string | null = null;

async function loadModule(): Promise<PurchasesModule> {
  modPromise ??= import("@revenuecat/purchases-js");
  return modPromise;
}

/** Configures (once per signed-in user) and returns the shared instance. */
async function getPurchases() {
  if (!API_KEY) {
    throw new Error("VITE_REVENUECAT_WEB_API_KEY is not configured.");
  }
  const { Purchases } = await loadModule();
  const { data } = await supabase.auth.getUser();
  const appUserId = data.user?.id;
  if (!appUserId) throw new Error("Sign in before making a purchase.");

  if (configuredFor !== appUserId) {
    Purchases.configure({ apiKey: API_KEY, appUserId });
    configuredFor = appUserId;
  }
  return Purchases.getSharedInstance();
}

/** Maps our plan/interval pair onto a RevenueCat package identifier. */
function packageIdFor(plan: CheckoutRequest["plan"], interval: CheckoutRequest["interval"]) {
  if (plan === "starter") return interval === "annual" ? "starter_yearly" : "starter_monthly";
  return interval === "annual" ? "yearly" : "monthly";
}

async function findPackage(identifier: string) {
  const purchases = await getPurchases();
  const offerings = await purchases.getOfferings();
  const candidates = [
    ...(offerings.current ? [offerings.current] : []),
    ...Object.values(offerings.all ?? {}),
  ];
  for (const offering of candidates) {
    const match = offering.availablePackages.find(
      (p) => p.identifier === identifier || p.webBillingProduct?.identifier === identifier,
    );
    if (match) return { purchases, pkg: match };
  }
  throw new Error(`RevenueCat package "${identifier}" was not found in any offering.`);
}

/** Pushes the current RevenueCat entitlement state into our database. */
async function pushEntitlements() {
  const purchases = await getPurchases();
  const info = await purchases.getCustomerInfo();
  const entitlement = info.entitlements.active[PRO_ENTITLEMENT];

  await supabase.functions.invoke("revenuecat-sync", {
    body: {
      active: Boolean(entitlement),
      productIdentifier: entitlement?.productIdentifier ?? null,
      expiresDate: entitlement?.expirationDate ?? null,
      willRenew: entitlement?.willRenew ?? false,
      originalAppUserId: info.originalAppUserId,
    },
  });
}

export const revenueCatBillingProvider: BillingProvider = {
  id: "revenuecat",

  async createCheckout({ plan, interval }: CheckoutRequest): Promise<CheckoutResult> {
    const { purchases, pkg } = await findPackage(packageIdFor(plan, interval));
    await purchases.purchase({ rcPackage: pkg });
    await pushEntitlements();
    return { completed: true };
  },

  async createPackCheckout({ pack }: PackCheckoutRequest): Promise<CheckoutResult> {
    const { purchases, pkg } = await findPackage(pack);
    await purchases.purchase({ rcPackage: pkg });
    await pushEntitlements();
    return { completed: true };
  },

  /**
   * RevenueCat Web Billing has no hosted portal; management lives in our own
   * Billing page, so we surface the customer's manageable subscription URL when
   * RevenueCat provides one and otherwise fall back to the in-app page.
   */
  async openCustomerPortal(): Promise<CheckoutResult> {
    const purchases = await getPurchases();
    const info = await purchases.getCustomerInfo();
    const url = (info as { managementURL?: string | null }).managementURL;
    return url ? { url } : { completed: true };
  },

  /** Restore purchases / verify subscription: re-read RevenueCat and sync. */
  async syncSubscription() {
    await pushEntitlements();
  },
};
