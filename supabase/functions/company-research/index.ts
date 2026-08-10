import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getResearchProvider } from "../_shared/research.ts";
import { FirecrawlError } from "../_shared/firecrawl.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const RATE_LIMIT = 10;
const WINDOW_MS = 60_000;
const hitsByUser = new Map<string, number[]>();

const RESEARCH_SCHEMA = {
  type: "object",
  properties: {
    overview: { type: "string", description: "2-3 sentence factual company overview" },
    industry: { type: ["string", "null"] },
    businessModel: { type: ["string", "null"] },
    products: { type: "array", items: { type: "string" } },
    recentDevelopments: { type: "array", items: { type: "string" }, description: "Recent, dated where possible" },
    roleContext: { type: ["string", "null"], description: "How the target role fits the company, if a role was given" },
    interviewAngles: { type: "array", items: { type: "string" }, description: "Gradr coaching: what to emphasise" },
    questionsToAsk: { type: "array", items: { type: "string" }, description: "Gradr coaching: questions for the interviewer" },
    talkingPoints: { type: "array", items: { type: "string" }, description: "Gradr coaching: candidate talking points" },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
  },
  required: ["overview", "confidence"],
} as const;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized", code: "unauthorized" }, 401);

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return json({ error: "Unauthorized", code: "unauthorized" }, 401);

    const now = Date.now();
    const hits = (hitsByUser.get(user.id) || []).filter((t) => now - t < WINDOW_MS);
    if (hits.length >= RATE_LIMIT) {
      return json({ error: "Too many research requests. Try again in a minute.", code: "rate_limited" }, 429);
    }
    hits.push(now);
    hitsByUser.set(user.id, hits);

    const body = await req.json().catch(() => ({}));
    const company = typeof body.company === "string" ? body.company.trim().slice(0, 120) : "";
    const role = typeof body.role === "string" ? body.role.trim().slice(0, 120) : "";
    const refresh = body.refresh === true;
    if (!company) return json({ error: "A company name is required.", code: "invalid_input" }, 400);

    const cacheKey = `${company.toLowerCase()}::${role.toLowerCase()}`;

    if (!refresh) {
      const { data: cached } = await supabase
        .from("company_research")
        .select("payload, sources, provider, created_at")
        .eq("cache_key", cacheKey)
        .gt("created_at", new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString())
        .maybeSingle();
      if (cached) {
        return json({ ...(cached.payload as object), sources: cached.sources, provider: cached.provider, cached: true, generatedAt: cached.created_at });
      }
    }

    const provider = getResearchProvider();
    if (!provider) {
      return json({ error: "Company research is not configured for this workspace.", code: "not_configured" }, 503);
    }

    let research;
    try {
      research = await provider.research(
        `${company} company: overview, industry, business model, main products, and notable developments in the last 12 months${role ? `. Also: what the ${role} role typically involves at ${company}` : ""}.`,
      );
    } catch (e) {
      if (e instanceof FirecrawlError) return json({ error: e.message, code: e.code }, e.status);
      console.error("research provider failed:", e);
      return json({ error: (e as Error).message || "Research failed. Try again shortly.", code: "research_failed" }, 502);
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return json({ error: "AI is not configured.", code: "not_configured" }, 503);

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content:
              "You are Gradr's interview research analyst. Separate FACTS (only from supplied research, never invented) from COACHING (your own advice fields: interviewAngles, questionsToAsk, talkingPoints). If the research is thin, say so via confidence:'low' and leave factual fields empty rather than guessing.",
          },
          {
            role: "user",
            content: `Company: ${company}\nTarget role: ${role || "(not specified)"}\n\nResearch material:\n${research.text.slice(0, 20_000)}`,
          },
        ],
        tools: [{ type: "function", function: { name: "company_brief", description: "Company research brief", parameters: RESEARCH_SCHEMA } }],
        tool_choice: { type: "function", function: { name: "company_brief" } },
      }),
    });

    if (!resp.ok) {
      if (resp.status === 429) return json({ error: "AI is busy. Try again in a moment.", code: "rate_limited" }, 429);
      if (resp.status === 402) return json({ error: "AI credits exhausted.", code: "no_credits" }, 402);
      console.error(`AI error ${resp.status}: ${await resp.text()}`);
      return json({ error: "The research could not be summarised. Try again.", code: "ai_failed" }, 502);
    }

    const data = await resp.json();
    const tc = data.choices?.[0]?.message?.tool_calls?.[0];
    const payload = tc ? JSON.parse(tc.function.arguments) : null;
    if (!payload) return json({ error: "No usable research was produced.", code: "empty" }, 422);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    await admin.from("company_research").upsert(
      { cache_key: cacheKey, company, role: role || null, payload, sources: research.sources, provider: research.provider, created_at: new Date().toISOString() },
      { onConflict: "cache_key" },
    );

    return json({ ...payload, sources: research.sources, provider: research.provider, cached: false, generatedAt: new Date().toISOString() });
  } catch (e) {
    console.error("company-research error:", e);
    return json({ error: "Research failed unexpectedly. Please try again.", code: "internal" }, 500);
  }
});
