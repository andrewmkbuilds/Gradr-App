import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export function useIsAdmin() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["isAdmin", user?.id],
    enabled: !!user,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user!.id)
        .eq("role", "admin")
        .maybeSingle();
      if (error) return false;
      return !!data;
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

/** Public marketing settings (safe for anyone) — internal config stays admin-only. */
export function useAffiliateSettings() {
  return useQuery({
    queryKey: ["affiliateSettings"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase.rpc("get_affiliate_public_settings");
      return Array.isArray(data) ? data[0] ?? null : data;
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
