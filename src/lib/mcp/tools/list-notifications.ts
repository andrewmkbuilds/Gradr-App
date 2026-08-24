import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { NOT_AUTHENTICATED, errorResult, jsonResult, supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_notifications",
  title: "List notifications",
  description: "List the signed-in user's recent Gradr notifications, newest first.",
  inputSchema: {
    unread_only: z.boolean().optional().describe("Only return unread notifications. Defaults to false."),
    limit: z.number().int().min(1).max(50).optional().describe("Maximum notifications to return. Defaults to 20."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ unread_only, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return NOT_AUTHENTICATED;
    let q = supabaseForUser(ctx)
      .from("notifications")
      .select("id, type, title, body, link, read_at, created_at")
      .order("created_at", { ascending: false })
      .limit(limit ?? 20);
    if (unread_only) q = q.is("read_at", null);
    const { data, error } = await q;
    if (error) return errorResult(error.message);
    return jsonResult({ notifications: data ?? [] });
  },
});
