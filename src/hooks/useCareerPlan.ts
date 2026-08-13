import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { invokeFunction } from "@/lib/invokeFunction";
import { toast } from "sonner";

export interface PlanStep {
  id: string;
  day: 1 | 2 | 3;
  kind: "apply" | "tailor" | "outreach" | "prep" | "research";
  title: string;
  detail: string;
  minutes: number;
  to: string;
  done: boolean;
  doneAt?: string;
}

export interface CareerPlan {
  id: string;
  summary: string | null;
  steps: PlanStep[];
  valid_until: string;
  created_at: string;
}

function normalise(row: Record<string, unknown> | null): CareerPlan | null {
  if (!row) return null;
  return {
    id: String(row["id"]),
    summary: (row["summary"] as string | null) ?? null,
    steps: Array.isArray(row["steps"]) ? (row["steps"] as PlanStep[]) : [],
    valid_until: String(row["valid_until"]),
    created_at: String(row["created_at"]),
  };
}

/**
 * The personalised next-3-days plan.
 *
 * The newest plan is authoritative; it expires after three days so the UI can
 * prompt for a fresh sequence instead of showing stale actions.
 */
export function useCareerPlan() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const key = ["career-plan", user?.id];

  const query = useQuery({
    queryKey: key,
    enabled: !!user,
    staleTime: 30_000,
    queryFn: async (): Promise<CareerPlan | null> => {
      const { data, error } = await supabase
        .from("career_plans")
        .select("id, summary, steps, valid_until, created_at")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return normalise(data as Record<string, unknown> | null);
    },
  });

  const generate = useMutation({
    mutationFn: async () => {
      const { data, error } = await invokeFunction("career-plan", { body: {} });
      if (error) throw new Error(error.message || "Plan generation failed");
      const plan = normalise((data as { plan?: Record<string, unknown> } | null)?.plan ?? null);
      if (!plan) throw new Error("No plan returned");
      return plan;
    },
    onSuccess: (plan) => {
      queryClient.setQueryData(key, plan);
      toast.success("Your next 3 days are planned");
    },
    onError: (e: Error) => toast.error(e.message || "Couldn't build your plan right now"),
  });

  const toggleStep = useCallback(
    async (stepId: string, done: boolean) => {
      const plan = queryClient.getQueryData<CareerPlan | null>(key);
      if (!plan) return;
      const steps = plan.steps.map((s) =>
        s.id === stepId ? { ...s, done, doneAt: done ? new Date().toISOString() : undefined } : s,
      );
      queryClient.setQueryData(key, { ...plan, steps });
      const { error } = await supabase.from("career_plans").update({ steps: steps as unknown as never }).eq("id", plan.id);
      if (error) {
        queryClient.setQueryData(key, plan);
        toast.error("Couldn't save that step");
        return;
      }
      if (done && steps.every((s) => s.done)) toast.success("Plan complete — that's a strong three days.");
    },
    [queryClient, key],
  );

  const plan = query.data ?? null;
  const isExpired = plan ? new Date(plan.valid_until).getTime() < Date.now() : false;

  return {
    plan,
    isExpired,
    isLoading: query.isLoading,
    generate: () => generate.mutateAsync(),
    isGenerating: generate.isPending,
    toggleStep,
  };
}
