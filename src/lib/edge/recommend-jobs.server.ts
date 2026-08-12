import { createClient } from "./shared/supabase";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RATE_LIMIT = 10;
const WINDOW_MS = 60_000;
const userHits = new Map<string, number[]>();
function checkRateLimit(userId: string) {
  const now = Date.now();
  const hits = (userHits.get(userId) || []).filter((t) => now - t < WINDOW_MS);
  if (hits.length >= RATE_LIMIT) return { ok: false, retryAfter: Math.ceil((WINDOW_MS - (now - hits[0])) / 1000) };
  hits.push(now); userHits.set(userId, hits);
  return { ok: true as const };
}

export const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const supabase = createClient(
      process.env['SUPABASE_URL']!,
      process.env['SUPABASE_PUBLISHABLE_KEY']!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const rl = checkRateLimit(user.id);
    if (!rl.ok) return new Response(JSON.stringify({ error: `Rate limit. Retry in ${rl.retryAfter}s.` }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { jobs, resumeText } = await req.json();
    if (!Array.isArray(jobs) || jobs.length === 0) {
      return new Response(JSON.stringify({ scores: [] }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const LOVABLE_API_KEY = process.env['LOVABLE_API_KEY'];
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY missing");

    // Truncate to keep prompt small
    const compact = jobs.slice(0, 20).map((j: any, i: number) => ({
      i,
      title: j.title,
      company: j.company,
      desc: (j.description || "").slice(0, 600),
    }));

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "You score how well jobs fit a candidate's resume. Use the tool to return one score per job." },
          { role: "user", content: `Resume:\n${(resumeText || "").slice(0, 4000)}\n\nJobs:\n${JSON.stringify(compact)}` },
        ],
        tools: [{
          type: "function",
          function: {
            name: "score_jobs",
            description: "Return match scores",
            parameters: {
              type: "object",
              properties: {
                scores: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      i: { type: "number" },
                      score: { type: "number", description: "0-100" },
                      reason: { type: "string" },
                    },
                    required: ["i", "score", "reason"],
                  },
                },
              },
              required: ["scores"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "score_jobs" } },
      }),
    });

    if (!resp.ok) {
      if (resp.status === 429 || resp.status === 402) {
        return new Response(JSON.stringify({ error: resp.status === 402 ? "AI credits exhausted" : "AI rate limited" }), { status: resp.status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      throw new Error(`AI error ${resp.status}`);
    }

    const data = await resp.json();
    const tc = data.choices?.[0]?.message?.tool_calls?.[0];
    const result = tc ? JSON.parse(tc.function.arguments) : { scores: [] };

    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("recommend-jobs error:", e);
    return new Response(JSON.stringify({ error: "An internal error occurred. Please try again." }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
};
