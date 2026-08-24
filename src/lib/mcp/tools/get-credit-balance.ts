import { defineTool } from "@lovable.dev/mcp-js";
import { NOT_AUTHENTICATED, errorResult, jsonResult, supabaseForUser } from "../supabase";

export default defineTool({
  name: "get_credit_balance",
  title: "Get credit balance",
  description:
    "Return the signed-in user's remaining Gradr credits (application and interview credits) and their subscription tier.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) return NOT_AUTHENTICATED;
    const supabase = supabaseForUser(ctx);
    const [credits, subscriber] = await Promise.all([
      supabase
        .from("usage_credits")
        .select("application_credits, interview_credits, environment, updated_at")
        .eq("user_id", ctx.getUserId())
        .maybeSingle(),
      supabase
        .from("subscribers")
        .select("subscribed, subscription_tier, subscription_end")
        .eq("user_id", ctx.getUserId())
        .maybeSingle(),
    ]);
    if (credits.error) return errorResult(credits.error.message);
    return jsonResult({ credits: credits.data ?? null, subscription: subscriber.data ?? null });
  },
});
