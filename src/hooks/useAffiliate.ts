import { useQuery } from "@tanstack/react-query";
import { invokeFunction } from "@/lib/invokeFunction";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/**
 * Role check. The source of truth is the server-side `is_admin()` function which
 * reads `user_roles` — never a hardcoded email or client state. Every admin
 * table/RPC is additionally protected by RLS, so this is purely for UI shaping.
 */
export function useIsAdmin() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["isAdmin", user?.id],
    enabled: !!user,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("is_admin");
      if (error) return false;
      return data === true;
    },
  });
}

export function useMyAffiliate() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["myAffiliate", user?.id],
    enabled: !!user,
    staleTime: 30_000,
    queryFn: async () => {
      const [appRes, profRes] = await Promise.all([
        supabase
          .from("affiliate_applications")
          .select("*")
          .eq("user_id", user!.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("affiliate_profiles")
          .select("*")
          .eq("user_id", user!.id)
          .maybeSingle(),
      ]);
      return {
        application: appRes.data,
        profile: profRes.data,
      };
    },
  });
}

export type AffiliateTierInfo = {
  key: string;
  name: string;
  color: string;
  bonus_rate: number;
  perks: string | null;
  min_referrals: number;
  remaining?: number;
};

export type AffiliateOverview = {
  has_profile: boolean;
  profile?: {
    id: string;
    code: string;
    status: string;
    approval_date: string;
    payout_email: string | null;
    payout_method: string | null;
  };
  stats?: {
    clicks: number;
    referrals: number;
    conversions: number;
    confirmed: number;
    conversion_rate: number;
    streak_weeks: number;
  };
  earnings?: {
    pending: number;
    approved: number;
    paid: number;
    reversed: number;
    unpaid: number;
    lifetime: number;
    avg_commission: number;
    payout_threshold: number;
    projected_next_30d: number;
  };
  tier?: AffiliateTierInfo | null;
  next_tier?: AffiliateTierInfo | null;
};

/** Server-computed affiliate stats: tier, streak, earnings and projections. */
export function useAffiliateOverview() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["affiliateOverview", user?.id],
    enabled: !!user,
    staleTime: 20_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("my_affiliate_overview");
      if (error) throw error;
      return (data ?? { has_profile: false }) as unknown as AffiliateOverview;
    },
  });
}

/** Anonymised leaderboard — codes are masked server-side, no PII is exposed. */
export function useAffiliateLeaderboard(limit = 10) {
  return useQuery({
    queryKey: ["affiliateLeaderboard", limit],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("affiliate_leaderboard", { _limit: limit });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Tier ladder, configured by admins in Affiliate Admin → Tiers. */
export function useAffiliateTiers() {
  return useQuery({
    queryKey: ["affiliateTiers"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("affiliate_tiers")
        .select("*")
        .eq("active", true)
        .order("min_referrals", { ascending: true });
      return data || [];
    },
  });
}

/** Public marketing settings (safe for anyone) — internal config stays admin-only. */
export function useAffiliateSettings() {
  return useQuery({
    queryKey: ["affiliateSettings"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await invokeFunction("affiliate-public", { body: {} });
      return data?.settings ?? null;
    },
  });
}

/** Full settings row — readable by admins and active affiliates only. */
export function useFullAffiliateSettings() {
  return useQuery({
    queryKey: ["affiliateSettingsAdmin"],
    staleTime: 30_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("affiliate_settings")
        .select("*")
        .eq("id", 1)
        .maybeSingle();
      return data;
    },
  });
}
