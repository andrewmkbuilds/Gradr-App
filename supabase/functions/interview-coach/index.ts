import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { consume, paymentRequired, resolveEnv } from "../_shared/entitlements.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Streaming chat: 30 messages per 60s per user
const RATE_LIMIT = 30;
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

    const { messages, targetRole, resumeText, directive, environment } = await req.json();
    if (!messages || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: "messages array is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // Sanitize: only allow user/assistant roles + bounded content; cap message count
    const safeMessages = messages
      .filter((m: any) => m && typeof m.content === "string")
      .slice(-50)
      .map((m: any) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: String(m.content).slice(0, 4000),
      }));

    const rl = checkRateLimit(user.id);
    if (!rl.ok) {
      return new Response(
        JSON.stringify({ error: `Rate limit exceeded. Try again in ${rl.retryAfter}s.` }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": String(rl.retryAfter) } },
      );
    }

    // ---- Entitlement: charged once per session, on the opening turn ------
    const isSessionStart = !safeMessages.some((m: { role: string }) => m.role === "assistant");
    if (isSessionStart) {
      const paymentEnv = resolveEnv(environment);
      const entitlement = await consume(user.id, "interview", paymentEnv);
      if (!entitlement.allowed) return paymentRequired(entitlement, corsHeaders);
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const safeDirective = typeof directive === "string" ? directive.slice(0, 8000) : "";

    const systemPrompt = `You are an expert interview coach conducting a realistic mock interview. Your role:

1. Act as the interviewer for a ${targetRole || "software engineering"} position
2. Ask one question at a time — mix behavioral, technical, and situational questions
3. After the candidate responds, provide brief constructive feedback (strengths + improvements)
4. Then ask the next question
5. Be encouraging but honest
6. If the conversation just started, introduce yourself and ask the first question
7. Vary question types: behavioral (STAR method), technical knowledge, system design, culture fit
8. Speak like a human on a live call: short sentences, natural connectors, no bullet lists or headings
${safeDirective ? `\n--- Session brief (follow this precisely) ---\n${safeDirective}\n--- End session brief ---` : ""}
${resumeText ? `\nCandidate's resume context:\n${String(resumeText).substring(0, 2000)}` : ""}

Keep responses concise and conversational — this is spoken aloud, so avoid markdown formatting.`;


    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          ...safeMessages,
        ],
        stream: true,
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
      throw new Error("AI interview coach failed");
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("interview-coach error:", e);
    return new Response(JSON.stringify({ error: "An internal error occurred. Please try again." }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
