import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { NOT_AUTHENTICATED, errorResult, jsonResult, supabaseForUser } from "../supabase";

export default defineTool({
  name: "search_discovered_jobs",
  title: "Search the Gradr job feed",
  description:
    "Search jobs Gradr has discovered from its sourcing feeds by keyword, location or remote flag. Use create_tracked_job to save one to the pipeline.",
  inputSchema: {
    query: z.string().optional().describe("Keyword matched against the job title."),
    company: z.string().optional().describe("Filter by company name."),
    location: z.string().optional().describe("Keyword matched against the job location."),
    remote: z.boolean().optional().describe("Only remote roles when true."),
    limit: z.number().int().min(1).max(50).optional().describe("Maximum jobs to return. Defaults to 20."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ query, company, location, remote, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return NOT_AUTHENTICATED;
    let q = supabaseForUser(ctx)
      .from("discovered_jobs")
      .select("id, title, company, location, remote, salary_min, salary_max, currency, url, source, posted_at")
      .order("posted_at", { ascending: false, nullsFirst: false })
      .limit(limit ?? 20);
    if (query) q = q.ilike("title", `%${query}%`);
    if (company) q = q.ilike("company", `%${company}%`);
    if (location) q = q.ilike("location", `%${location}%`);
    if (remote !== undefined) q = q.eq("remote", remote);
    const { data, error } = await q;
    if (error) return errorResult(error.message);
    return jsonResult({ jobs: data ?? [] });
  },
});
