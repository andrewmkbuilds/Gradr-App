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
  name: "create_tracked_job",
  title: "Add tracked job",
  description: "Add a job opportunity to the signed-in user's CareerFlow pipeline.",
  inputSchema: {
    title: z.string().min(1).describe("Job title (e.g. 'Senior Frontend Engineer')."),
    company: z.string().optional().describe("Company name."),
    location: z.string().optional().describe("Job location."),
    status: z.string().optional().describe("Initial pipeline status. Defaults to 'saved'."),
    remote: z.boolean().optional().describe("Whether the role is remote."),
    salary_min: z.number().optional(),
    salary_max: z.number().optional(),
    description: z.string().optional().describe("Full job description text."),
    notes: z.string().optional(),
    source: z.string().optional().describe("Where this job came from (e.g. 'linkedin', 'manual')."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const { data, error } = await supabaseForUser(ctx)
      .from("tracked_jobs")
      .insert({
        user_id: ctx.getUserId(),
        title: input.title,
        company: input.company ?? null,
        location: input.location ?? null,
        status: input.status ?? "saved",
        remote: input.remote ?? null,
        salary_min: input.salary_min ?? null,
        salary_max: input.salary_max ?? null,
        description: input.description ?? null,
        notes: input.notes ?? null,
        source: input.source ?? "mcp",
      })
      .select()
      .single();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: `Added "${data.title}" to your pipeline.` }],
      structuredContent: { job: data },
    };
  },
});
