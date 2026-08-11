import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { useCallback, useState } from "react";
import { billingService, type PlanInterval, type PlanKey } from "@/lib/billing";

export interface SubscriptionState {
  subscribed: boolean;
  tier: string | null;
  status: string | null;
  billingInterval: "monthly" | "annual" | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

const EMPTY: SubscriptionState = {
  subscribed: false,
  tier: null,
  status: null,
  billingInterval: null,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
};

export function useSubscription() {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ["subscription", user?.id],
    enabled: Boolean(user),
    staleTime: 30_000,
    queryFn: async (): Promise<SubscriptionState> => {
      const { data, error } = await supabase
        .from("subscribers")
        .select(
          "subscribed, subscription_tier, subscription_status, billing_interval, current_period_end, cancel_at_period_end",
        )
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return EMPTY;
      return {
        subscribed: data.subscribed,
        tier: data.subscription_tier,
        status: data.subscription_status,
        billingInterval: (data.billing_interval as "monthly" | "annual" | null) ?? null,
        currentPeriodEnd: data.current_period_end,
        cancelAtPeriodEnd: data.cancel_at_period_end,
      };
    },
  });

  const state = query.data ?? EMPTY;
  const tier = (state.tier ?? "free").toLowerCase();
  const active = Boolean(state.subscribed);
  const plan: PlanKey = active && tier === "starter" ? "starter" : active && tier === "pro" ? "pro" : "free";

  return {
    ...state,
    plan,
    isLoading: query.isLoading,
    /** Paying subscriber on any tier. */
    isSubscribed: active,
    isStarter: plan === "starter",
    isPro: plan === "pro",
    refetch: query.refetch,
  };
}

export function useCredits() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["usage-credits", user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("usage_credits")
        .select("application_credits, interview_credits")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data ?? { application_credits: 0, interview_credits: 0 };
    },
  });
}

export function usePurchases() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["purchases", user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchases")
        .select("id, pack_label, pack_key, credits_granted, amount_total, currency, status, created_at")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useBillingActions() {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<string | null>(null);

  const openExternal = (url: string) => {
    window.open(url, "_blank", "noopener,noreferrer");
  };

  /** Used by in-page providers (RevenueCat) once a purchase settles. */
  const refreshEntitlements = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ["subscription"] });
    await queryClient.invalidateQueries({ queryKey: ["usage-credits"] });
    await queryClient.invalidateQueries({ queryKey: ["purchases"] });
    toast.success("Purchase complete. Your plan is active.");
  }, [queryClient]);

  const startSubscription = useCallback(
    async (interval: PlanInterval, plan: PlanKey = "pro") => {
      setPending(`${plan}-${interval}`);
      try {
        const { url } = await billingService.createCheckout({ plan, interval });
        if (url) openExternal(url);
        else await refreshEntitlements();
      } catch {
        toast.error("Couldn't start checkout. Make sure billing is configured and try again.");
      } finally {
        setPending(null);
      }
    },
    [refreshEntitlements],
  );

  const buyPack = useCallback(async (pack: string) => {
    setPending(pack);
    try {
      const { url } = await billingService.createPackCheckout({ pack });
      if (url) openExternal(url);
      else await refreshEntitlements();
    } catch {
      toast.error("Couldn't start checkout. Please try again.");
    } finally {
      setPending(null);
    }
  }, [refreshEntitlements]);

  const openPortal = useCallback(async () => {
    setPending("portal");
    try {
      const { url } = await billingService.openCustomerPortal();
      if (url) openExternal(url);
      else toast.info("Manage your plan from the Billing page.");
    } catch {
      toast.error("Couldn't open the billing portal. Start a plan first, then try again.");
    } finally {
      setPending(null);
    }
  }, []);

  const restorePurchases = useCallback(async () => {
    setPending("restore");
    try {
      await billingService.syncSubscription();
      await queryClient.invalidateQueries({ queryKey: ["subscription"] });
      await queryClient.invalidateQueries({ queryKey: ["usage-credits"] });
      await queryClient.invalidateQueries({ queryKey: ["purchases"] });
      toast.success("Subscription status refreshed.");
    } catch {
      toast.error("Couldn't refresh your subscription right now.");
    } finally {
      setPending(null);
    }
  }, [queryClient]);

  return { pending, startSubscription, buyPack, openPortal, restorePurchases };
}

/** True when Stripe reports a failed/overdue invoice needing user action. */
export function usePaymentIssue() {
  const { status, isLoading } = useSubscription();
  const failing = status === "past_due" || status === "unpaid" || status === "incomplete";
  return { hasPaymentIssue: !isLoading && failing, status };
}

