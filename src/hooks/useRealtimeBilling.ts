import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/**
 * Keeps billing surfaces live.
 *
 * Credits and subscription rows are written by the payments webhook, not by
 * the client, so a purchase completed in the Paddle overlay would otherwise
 * only appear after a manual refresh. Subscribing to the user's own rows makes
 * the balance update the moment the webhook lands.
 */
export function useRealtimeBilling() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!user) return;

    const invalidate = () => {
      void queryClient.invalidateQueries({ queryKey: ["usage-credits"] });
      void queryClient.invalidateQueries({ queryKey: ["entitlements"] });
      void queryClient.invalidateQueries({ queryKey: ["purchases"] });
      void queryClient.invalidateQueries({ queryKey: ["subscription"] });
    };

    const filter = `user_id=eq.${user.id}`;
    const channel = supabase
      .channel(`billing-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "usage_credits", filter }, invalidate)
      .on("postgres_changes", { event: "*", schema: "public", table: "purchases", filter }, invalidate)
      .on("postgres_changes", { event: "*", schema: "public", table: "subscribers", filter }, invalidate)
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user, queryClient]);
}
