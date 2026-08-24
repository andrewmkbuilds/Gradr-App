import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { NOT_AUTHENTICATED, errorResult, jsonResult, supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_interview_sessions",
  title: "List mock interview sessions",
  description:
    "List the signed-in user's completed AI mock interview sessions with scores, focus areas and target roles.",
  inputSchema: {
    limit: z.number().int().min(1).max(50).optional().describe("Maximum sessions to return. Defaults to 10."),
    include_report: z
      .boolean()
      .optional()
      .describe("Include the full AI feedback report and practice plan. Defaults to false."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit, include_report }, ctx) => {
    if (!ctx.isAuthenticated()) return NOT_AUTHENTICATED;
    const columns = include_report
      ? "id, target_role, focus_areas, overall_score, duration_sec, report, practice_plan, created_at"
      : "id, target_role, focus_areas, overall_score, duration_sec, created_at";
    const { data, error } = await supabaseForUser(ctx)
      .from("interview_sessions")
      .select(columns)
      .order("created_at", { ascending: false })
      .limit(limit ?? 10);
    if (error) return errorResult(error.message);
    return jsonResult({ sessions: data ?? [] });
  },
});
