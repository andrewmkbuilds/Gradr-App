import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { NOT_AUTHENTICATED, errorResult, jsonResult, supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_job_reminders",
  title: "List job reminders",
  description:
    "List the signed-in user's follow-up reminders for tracked jobs, with due dates and completion state.",
  inputSchema: {
    include_done: z.boolean().optional().describe("Include completed reminders. Defaults to false."),
    limit: z.number().int().min(1).max(100).optional().describe("Maximum reminders to return. Defaults to 25."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ include_done, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return NOT_AUTHENTICATED;
    let q = supabaseForUser(ctx)
      .from("job_reminders")
      .select("id, title, due_at, done, tracked_job_id, created_at")
      .order("due_at", { ascending: true })
      .limit(limit ?? 25);
    if (!include_done) q = q.eq("done", false);
    const { data, error } = await q;
    if (error) return errorResult(error.message);
    return jsonResult({ reminders: data ?? [] });
  },
});
