import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Per-user sliding window rate limit (in-memory, per instance)
// 10 requests per 60 seconds per user
const RATE_LIMIT = 10;
const WINDOW_MS = 60_000;
const userHits = new Map<string, number[]>();

function checkRateLimit(userId: string): { ok: boolean; retryAfter?: number } {
  const now = Date.now();
  const hits = (userHits.get(userId) || []).filter((t) => now - t < WINDOW_MS);
  if (hits.length >= RATE_LIMIT) {
    const retryAfter = Math.ceil((WINDOW_MS - (now - hits[0])) / 1000);
    return { ok: false, retryAfter };
  }
  hits.push(now);
  userHits.set(userId, hits);
  return { ok: true };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Auth check
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

    // Rate limit per user
    const rl = checkRateLimit(user.id);
    if (!rl.ok) {
      return new Response(
        JSON.stringify({ error: `Rate limit exceeded. Try again in ${rl.retryAfter}s.` }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": String(rl.retryAfter) } },
      );
    }

    const { resumeText, targetRole } = await req.json();
    if (!resumeText) {
      return new Response(JSON.stringify({ error: "resumeText is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // Hard cap to avoid blowing the model's context window (PDF binary, etc.)
    const MAX_CHARS = 80_000;
    const safeText = String(resumeText).slice(0, MAX_CHARS);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const systemPrompt = `You are an expert ATS resume analyzer and career coach. Analyze the resume text and return a JSON object with this exact structure:
{
  "ats_score": <number 0-100>,
  "keyword_match": <number 0-100>,
  "formatting_score": <number 0-100>,
  "impact_score": <number 0-100>,
  "readability_score": <number 0-100>,
  "suggestions": [
    { "type": "critical|warning|improvement|good", "text": "<suggestion text>" }
  ]
}
Rules:
- "critical" = must fix for ATS pass
- "warning" = should improve
- "improvement" = nice to have
- "good" = already well done
- Give 5-8 suggestions total
- Be specific and actionable
- If a target role is provided, tailor suggestions to that role`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Analyze this resume${targetRole ? ` for the role: ${targetRole}` : ""}:\n\n${safeText}` },
        ],
        tools: [{
          type: "function",
          function: {
            name: "resume_analysis",
            description: "Return structured resume analysis",
            parameters: {
              type: "object",
              properties: {
                ats_score: { type: "number" },
                keyword_match: { type: "number" },
                formatting_score: { type: "number" },
                impact_score: { type: "number" },
                readability_score: { type: "number" },
                suggestions: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      type: { type: "string", enum: ["critical", "warning", "improvement", "good"] },
                      text: { type: "string" },
                    },
                    required: ["type", "text"],
                  },
                },
              },
              required: ["ats_score", "keyword_match", "formatting_score", "impact_score", "readability_score", "suggestions"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "resume_analysis" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded, please try again later." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Credits exhausted, please add funds." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      throw new Error("AI analysis failed");
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    const analysis = toolCall ? JSON.parse(toolCall.function.arguments) : null;

    if (!analysis) throw new Error("Failed to parse AI response");

    return new Response(JSON.stringify(analysis), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("analyze-resume error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
