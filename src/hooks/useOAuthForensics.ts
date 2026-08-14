/**
 * Admin-side reader for the Google OAuth redirect-chain log.
 *
 * Reads are protected by RLS (`has_role(auth.uid(), 'admin')`) — the filters
 * below only narrow an already-authorised result set, they never widen it.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { buildTimelines, type OAuthFlowEvent, type OAuthTimeline } from "@/lib/oauth/forensics";

export interface ForensicsFilters {
  /** ISO date (yyyy-mm-dd), inclusive */
  from?: string;
  /** ISO date (yyyy-mm-dd), inclusive */
  to?: string;
  /** user id or free-text match against request id / URLs */
  search?: string;
  accountType?: "all" | "existing" | "new" | "unknown";
  deviation?: "all" | "deviations" | "clean";
  stateResult?: "all" | "ok" | "missing" | "mismatch" | "not_applicable";
  nonceResult?: "all" | "ok" | "missing" | "mismatch" | "not_applicable";
  /** how many sign-in flows to show */
  limit?: number;
}

/** Client-side narrowing that the database cannot express (cross-hop search). */
export function filterTimelines(timelines: OAuthTimeline[], filters: ForensicsFilters): OAuthTimeline[] {
  const term = filters.search?.trim().toLowerCase();
  return timelines.filter((t) => {
    if (filters.accountType && filters.accountType !== "all" && t.accountType !== filters.accountType) return false;
    if (filters.deviation === "deviations" && !t.deviation) return false;
    if (filters.deviation === "clean" && t.deviation) return false;
    if (filters.stateResult && filters.stateResult !== "all" && t.stateResult !== filters.stateResult) return false;
    if (filters.nonceResult && filters.nonceResult !== "all" && t.nonceResult !== filters.nonceResult) return false;
    if (term) {
      const haystack = [
        t.requestId,
        t.userId ?? "",
        t.finalUrl ?? "",
        ...t.hops.flatMap((h) => [h.source_url ?? "", h.destination_url ?? "", h.note ?? "", h.stage]),
      ]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(term)) return false;
    }
    return true;
  });
}

export function useOAuthForensics(filters: ForensicsFilters) {
  return useQuery({
    queryKey: ["oauth-forensics", filters],
    queryFn: async (): Promise<OAuthTimeline[]> => {
      let query = supabase
        .from("oauth_flow_events")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(2000);

      if (filters.from) query = query.gte("created_at", `${filters.from}T00:00:00.000Z`);
      if (filters.to) query = query.lte("created_at", `${filters.to}T23:59:59.999Z`);

      const { data, error } = await query;
      if (error) throw error;

      const timelines = buildTimelines((data ?? []) as unknown as OAuthFlowEvent[]);
      return filterTimelines(timelines, filters).slice(0, filters.limit ?? 50);
    },
    staleTime: 30_000,
  });
}
