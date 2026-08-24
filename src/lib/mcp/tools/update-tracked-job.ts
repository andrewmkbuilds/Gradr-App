import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { NOT_AUTHENTICATED, errorResult, jsonResult, supabaseForUser } from "../supabase";

export default defineTool({
  name: "update_tracked_job",
  title: "Update tracked job",
  description:
    "Update a job in the signed-in user's Gradr pipeline — move its status, add notes, or record the applied date.",
  inputSchema: {
    id: z.string().describe("The tracked job id (from list_tracked_jobs)."),
    status: z
      .string()
      .optional()
      .describe("New pipeline status (e.g. 'saved', 'applied', 'interview', 'offer', 'rejected')."),
    notes: z.string().optional().describe("Replace the job's notes."),
    applied_at: z.string().optional().describe("ISO timestamp for when the user applied."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  handler: async ({ id, status, notes, applied_at }, ctx) => {
    if (!ctx.isAuthenticated()) return NOT_AUTHENTICATED;
    const patch: Record<string, unknown> = { last_touch_at: new Date().toISOString() };
    if (status !== undefined) patch.status = status;
    if (notes !== undefined) patch.notes = notes;
    if (applied_at !== undefined) patch.applied_at = applied_at;
    if (Object.keys(patch).length === 1) return errorResult("Provide at least one field to update.");

    const { data, error } = await supabaseForUser(ctx)
      .from("tracked_jobs")
      .update(patch)
      .eq("id", id)
      .eq("user_id", ctx.getUserId())
      .select()
      .maybeSingle();
    if (error) return errorResult(error.message);
    if (!data) return errorResult(`No tracked job found with id ${id}.`);
    return jsonResult({ job: data });
  },
});
