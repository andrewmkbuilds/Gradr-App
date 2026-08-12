import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function supabaseForUser(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "list_tracked_jobs",
  title: "List tracked jobs",
  description: "List jobs the signed-in user is tracking in their Gradr pipeline, optionally filtered by status.",
  inputSchema: {
    status: z.string().optional().describe("Filter by pipeline status (e.g. 'saved', 'applied', 'interview', 'offer', 'rejected')."),
    limit: z.number().int().min(1).max(100).optional().describe("Maximum jobs to return. Defaults to 50."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ status, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    let q = supabaseForUser(ctx)
      .from("tracked_jobs")
      .select("id, title, company, location, status, match_score, salary_min, salary_max, remote, applied_at, created_at, notes")
      .order("created_at", { ascending: false })
      .limit(limit ?? 50);
    if (status) q = q.eq("status", status);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      structuredContent: { jobs: data ?? [] },
    };
  },
});
