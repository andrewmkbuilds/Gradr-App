import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";

function supabaseForUser(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "get_profile",
  title: "Get my Gradr profile",
  description: "Return the signed-in user's Gradr profile: name, email, target role, and career preferences.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const [profile, prefs] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", ctx.getUserId()).maybeSingle(),
      supabase.from("user_preferences").select("*").eq("user_id", ctx.getUserId()).maybeSingle(),
    ]);
    if (profile.error) return { content: [{ type: "text", text: profile.error.message }], isError: true };
    const result = { profile: profile.data, preferences: prefs.data ?? null, email: ctx.getUserEmail() };
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      structuredContent: result,
    };
  },
});
