import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sseResponse, streamGatewayChat } from "../_shared/aiStream.ts";
import { checkRateLimit as durableRateLimit } from "../_shared/rateLimit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ENDPOINT = "practice-plan";
const RATE_LIMIT = 5;
const WINDOW_SECONDS = 60;

/** Durable, cross-instance limit (see _shared/rateLimit.ts). Fails closed. */
async function checkRateLimit(userId: string): Promise<boolean> {
  const r = await durableRateLimit(userId, ENDPOINT, RATE_LIMIT, WINDOW_SECONDS);
  return r.allowed;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!await checkRateLimit(user.id)) {
      return new Response(JSON.stringify({ error: "Too many plan requests. Try again shortly." }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const report = body.report && typeof body.report === "object" ? body.report : null;
    if (!report) {
      return new Response(JSON.stringify({ error: "report is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const targetRole = String(body.targetRole ?? "").slice(0, 120);
    const wantsStream = body.stream === true;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const planRequest = {
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content:
              "You are an interview coach. Build a realistic, personalised 7-day practice plan from a candidate's mock interview scorecard. Each day must take 20-45 minutes, target the weakest competencies first, and include concrete practice questions and drills. Never invent facts about the candidate.",
          },
          {
            role: "user",
            content: `Target role: ${targetRole || "general"}\nScorecard JSON:\n${JSON.stringify(report).slice(0, 6000)}`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "submit_plan",
              description: "Return a structured 7-day practice plan.",
              parameters: {
                type: "object",
                properties: {
                  focusAreas: { type: "array", items: { type: "string" } },
                  summary: { type: "string" },
                  days: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        day: { type: "number" },
                        theme: { type: "string" },
                        minutes: { type: "number" },
                        objective: { type: "string" },
                        questions: { type: "array", items: { type: "string" } },
                        drills: { type: "array", items: { type: "string" } },
                      },
                      required: ["day", "theme", "minutes", "objective", "questions", "drills"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["focusAreas", "summary", "days"],
                additionalProperties: false,
              },
            },
          },
        ],
      tool_choice: { type: "function", function: { name: "submit_plan" } },
    };

    // ------------------------- streamed generation ------------------------
    if (wantsStream) {
      return sseResponse(corsHeaders, async (writer, signal) => {
        writer.stage("read", "Reading your scorecard", 0.12);
        writer.stage("plan", "Designing your 7-day plan", 0.25);

        let streamed;
        try {
          streamed = await streamGatewayChat({
            apiKey: LOVABLE_API_KEY,
            body: planRequest,
            signal,
            onToolArgs: (_name, _delta, all) => {
              // Each day is roughly a fixed slice of the payload, so argument
              // length is an honest progress signal here.
              writer.stage("plan", "Designing your 7-day plan", Math.min(0.95, 0.25 + (all.length / 4200) * 0.7));
            },
          });
        } catch (err) {
          if (signal.aborted) return;
          throw err;
        }

        if (!streamed.ok) {
          writer.send("error", { message: streamed.error ?? "Plan generation failed", status: streamed.status });
          return;
        }

        const args = streamed.toolArgs["submit_plan"] ?? Object.values(streamed.toolArgs)[0];
        let plan: unknown = null;
        try {
          plan = args ? JSON.parse(args) : null;
        } catch {
          plan = null;
        }
        if (!plan) {
          writer.send("error", { message: "The model returned an incomplete plan. Please retry.", status: 502 });
          return;
        }

        writer.stage("done", "Plan ready", 1);
        writer.send("result", { plan });
      });
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(planRequest),
    });

    if (response.status === 429 || response.status === 402) {
      return new Response(
        JSON.stringify({ error: response.status === 429 ? "Rate limit exceeded, try again later." : "Credits exhausted." }),
        { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (!response.ok) {
      console.error("AI gateway error:", response.status, await response.text());
      throw new Error("Plan generation failed");
    }

    const data = await response.json();
    const args = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) throw new Error("No plan returned");
    const plan = JSON.parse(args);

    return new Response(JSON.stringify({ plan }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("practice-plan error:", e);
    return new Response(JSON.stringify({ error: "An internal error occurred. Please try again." }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
