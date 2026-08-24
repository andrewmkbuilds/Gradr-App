import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { NOT_AUTHENTICATED, errorResult, jsonResult, supabaseForUser } from "../supabase";

export default defineTool({
  name: "create_job_reminder",
  title: "Create job reminder",
  description: "Create a follow-up reminder for one of the signed-in user's tracked jobs.",
  inputSchema: {
    tracked_job_id: z.string().describe("The tracked job id the reminder belongs to (from list_tracked_jobs)."),
    title: z.string().describe("What to be reminded about, e.g. 'Follow up with the recruiter'."),
    due_at: z.string().describe("ISO timestamp for when the reminder is due."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  handler: async ({ tracked_job_id, title, due_at }, ctx) => {
    if (!ctx.isAuthenticated()) return NOT_AUTHENTICATED;
    const { data, error } = await supabaseForUser(ctx)
      .from("job_reminders")
      .insert({ user_id: ctx.getUserId(), tracked_job_id, title, due_at })
      .select()
      .single();
    if (error) return errorResult(error.message);
    return jsonResult({ reminder: data });
  },
});
