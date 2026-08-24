import { defineTool } from "@lovable.dev/mcp-js";
import { NOT_AUTHENTICATED, errorResult, jsonResult, supabaseForUser } from "../supabase";

export default defineTool({
  name: "get_career_plan",
  title: "Get career plan",
  description:
    "Return the signed-in user's current AI-generated Gradr career plan: summary and the ordered list of steps.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) return NOT_AUTHENTICATED;
    const { data, error } = await supabaseForUser(ctx)
      .from("career_plans")
      .select("id, summary, steps, valid_until, created_at, updated_at")
      .eq("user_id", ctx.getUserId())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) return errorResult(error.message);
    if (!data) {
      return {
        content: [
          {
            type: "text" as const,
            text: "No career plan yet. Generate one from the Career page in Gradr.",
          },
        ],
        structuredContent: { plan: null },
      };
    }
    return jsonResult({ plan: data });
  },
});
