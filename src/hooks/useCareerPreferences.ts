import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { logPreferencesRead } from "@/lib/preferencesAudit";
import {
  EMPTY_PREFERENCES,
  preferencesFromRow,
  preferencesToRow,
  type CareerPreferences,
} from "@/lib/careerPrefs";

/**
 * Reads and writes the signed-in user's career targeting preferences.
 *
 * Everything downstream (job re-ranking, the daily briefing, the 3-day plan)
 * reads from this single cache key so a change in onboarding propagates
 * immediately without a page reload.
 */
export function useCareerPreferences() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["career-preferences", user?.id],
    enabled: !!user,
    staleTime: 60_000,
    queryFn: async (): Promise<CareerPreferences> => {
      const { data, error } = await supabase
        .from("user_preferences")
        .select("*")
        .eq("user_id", user!.id)
        .maybeSingle();
      void logPreferencesRead("career_preferences", !!data);
      if (error) throw error;
      return preferencesFromRow(data as Record<string, unknown> | null);
    },
  });

  const save = useMutation({
    mutationFn: async (next: CareerPreferences) => {
      const payload = {
        user_id: user!.id,
        ...preferencesToRow(next),
        onboarded: true,
        onboarded_at: new Date().toISOString(),
      };
      const { error } = await supabase.from("user_preferences").upsert(payload, { onConflict: "user_id" });
      if (error) throw error;
      return next;
    },
    onSuccess: (next) => {
      queryClient.setQueryData(["career-preferences", user?.id], { ...next, onboarded: true });
      // Matching, briefing and plan all depend on targeting.
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["career-plan"] });
      queryClient.invalidateQueries({ queryKey: ["job-matches"] });
    },
  });

  const savePreferences = useCallback((next: CareerPreferences) => save.mutateAsync(next), [save]);

  return {
    preferences: query.data ?? EMPTY_PREFERENCES,
    isLoading: query.isLoading,
    isError: query.isError,
    savePreferences,
    isSaving: save.isPending,
  };
}
