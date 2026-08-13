/**
 * Shared career signal layer.
 *
 * One query, one cache, every surface. Resume health, targeting, pipeline,
 * follow-ups and interview prep are loaded once and reused across the app so
 * that Resume, Jobs, Pipeline, Interview and Growth can all reason about the
 * *same* picture of the user — and recommend the same single next action.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { buildBriefing, type Briefing, type BriefingInput, type NextAction } from "@/lib/careerBriefing";

export interface CareerSignals {
  input: BriefingInput;
  briefing: Briefing;
}

export async function loadCareerSignals(userId: string): Promise<CareerSignals> {
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const now = new Date();

  const [resumeRes, matchRes, trackedRes, remindersRes, interviewRes] = await Promise.all([
    supabase
      .from("resumes")
      .select("ats_score, keyword_match, formatting_score, impact_score")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1),
    supabase.from("job_matches").select("match_score").eq("user_id", userId).limit(100),
    supabase.from("tracked_jobs").select("status, applied_at").eq("user_id", userId),
    supabase
      .from("job_reminders")
      .select("title, due_at")
      .eq("user_id", userId)
      .eq("done", false)
      .order("due_at", { ascending: true })
      .limit(20),
    supabase
      .from("interview_sessions")
      .select("created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const resume = resumeRes.data?.[0];
  const matches = matchRes.data ?? [];
  const tracked = trackedRes.data ?? [];
  const sessions = interviewRes.data ?? [];
  const reminders = remindersRes.data ?? [];

  const stages = { saved: 0, applied: 0, interview: 0, offer: 0, rejected: 0 };
  let appliedThisWeek = 0;
  tracked.forEach((t) => {
    const k = (t.status || "saved") as keyof typeof stages;
    if (k in stages) stages[k]++;
    if (t.applied_at && new Date(t.applied_at) >= weekAgo) appliedThisWeek++;
  });

  const input: BriefingInput = {
    resumeScore: resume?.ats_score ?? 0,
    keywordMatch: resume?.keyword_match ?? 0,
    formattingScore: resume?.formatting_score ?? 0,
    impactScore: resume?.impact_score ?? 0,
    totalResumes: resumeRes.data?.length ?? 0,
    totalMatches: matches.length,
    highConfidence: matches.filter((m) => (m.match_score ?? 0) >= 85).length,
    appliedThisWeek,
    stages,
    overdueCount: reminders.filter((r) => new Date(r.due_at) < now).length,
    nextReminderTitle: reminders[0]?.title ?? null,
    interviewSessions: sessions.length,
    lastInterviewAt: sessions[0]?.created_at ?? null,
  };

  return { input, briefing: buildBriefing(input) };
}

export function useCareerSignals() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["career-signals", user?.id],
    enabled: !!user,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    queryFn: () => loadCareerSignals(user!.id),
  });
}

export type Surface = "resume" | "jobs" | "apply" | "pipeline" | "interview" | "growth";

const SURFACE_ROUTES: Record<Surface, string[]> = {
  resume: ["/resume"],
  jobs: ["/jobs", "/match"],
  apply: ["/apply"],
  pipeline: ["/pipeline"],
  interview: ["/interview"],
  growth: ["/growth"],
};

/**
 * The action to surface on a given page.
 *
 * Prefers an action that belongs to *this* surface (so the user can act
 * without leaving), and otherwise hands off to the highest-weight action
 * elsewhere in the product — that hand-off is what makes Gradr feel like one
 * system instead of six tools.
 */
export function actionForSurface(
  briefing: Briefing,
  surface: Surface,
): { action: NextAction; isHandoff: boolean } | null {
  const routes = SURFACE_ROUTES[surface];
  const local = briefing.actions.find((a) => routes.some((r) => a.to.startsWith(r)));
  if (local) return { action: local, isHandoff: false };
  const remote = briefing.actions[0];
  return remote ? { action: remote, isHandoff: true } : null;
}
