import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { NOT_AUTHENTICATED, errorResult, jsonResult, supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_scheduled_interviews",
  title: "List scheduled interviews",
  description:
    "List the signed-in user's scheduled real interviews and calls, with company, role, time and status.",
  inputSchema: {
    upcoming_only: z.boolean().optional().describe("Only return interviews starting from now. Defaults to true."),
    limit: z.number().int().min(1).max(100).optional().describe("Maximum interviews to return. Defaults to 25."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ upcoming_only, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return NOT_AUTHENTICATED;
    let q = supabaseForUser(ctx)
      .from("scheduled_interviews")
      .select("id, title, company, target_role, kind, status, starts_at, ends_at, timezone, location, html_link, notes")
      .order("starts_at", { ascending: true })
      .limit(limit ?? 25);
    if (upcoming_only !== false) q = q.gte("starts_at", new Date().toISOString());
    const { data, error } = await q;
    if (error) return errorResult(error.message);
    return jsonResult({ interviews: data ?? [] });
  },
});
