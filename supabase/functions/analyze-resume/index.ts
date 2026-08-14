import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { scoreResume, deterministicSuggestions } from "../_shared/resumeScoring.ts";
import { consume, paymentRequired, refund, resolveEnv, type PaymentEnv } from "../_shared/entitlements.ts";
import { logAiAuthorization } from "../_shared/securityAudit.ts";
import { sseResponse, streamGatewayChat } from "../_shared/aiStream.ts";
import { checkRateLimit as durableRateLimit } from "../_shared/rateLimit.ts";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Per-user sliding window rate limit (durable, shared across instances)
const ENDPOINT = "analyze-resume";
const RATE_LIMIT = 10;
const WINDOW_SECONDS = 60;

/** Durable, cross-instance limit (see _shared/rateLimit.ts). Fails closed. */
async function checkRateLimit(userId: string): Promise<{ ok: boolean; retryAfter?: number }> {
  const r = await durableRateLimit(userId, ENDPOINT, RATE_LIMIT, WINDOW_SECONDS);
  return { ok: r.allowed, retryAfter: r.retry_after };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Set once the request has been charged, so a later failure can be refunded.
  let meteredUserId: string | null = null;
  let paymentEnv: PaymentEnv = "sandbox";

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
      void logAiAuthorization({ source: "analyze-resume", decision: "denied", reason: "invalid_token" });
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rl = await checkRateLimit(user.id);
    if (!rl.ok) {
      return new Response(
        JSON.stringify({ error: `Rate limit exceeded. Try again in ${rl.retryAfter}s.` }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": String(rl.retryAfter) } },
      );
    }

    const { resumeText, targetRole, jobDescription, jobTitle, environment, stream } = await req.json();
    const wantsStream = stream === true;

    if (!resumeText) {
      return new Response(JSON.stringify({ error: "resumeText is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---- Entitlement: monthly allowance first, then purchased credits -----
    paymentEnv = resolveEnv(environment);
    const entitlement = await consume(user.id, "resume", paymentEnv);
    void logAiAuthorization({ source: "analyze-resume", decision: entitlement.allowed ? "allowed" : "denied", userId: user.id, feature: "resume", env: paymentEnv, reason: entitlement.reason ?? entitlement.source ?? null, details: { tier: entitlement.tier, used: entitlement.used, allowance: entitlement.allowance } });
    if (!entitlement.allowed) return paymentRequired(entitlement, corsHeaders);
    meteredUserId = user.id;

    const MAX_CHARS = 80_000;
    const safeText = String(resumeText).slice(0, MAX_CHARS);
    const safeJd = typeof jobDescription === "string" ? jobDescription.slice(0, 20_000) : "";
    const hasJd = safeJd.trim().length > 40;

    // ---- Deterministic scoring (source of truth for every number) ---------
    const scores = scoreResume({
      resumeText: safeText,
      jobDescription: safeJd,
      jobTitle: typeof jobTitle === "string" ? jobTitle : null,
      targetRole: typeof targetRole === "string" ? targetRole : null,
    });
    const ruleSuggestions = deterministicSuggestions(scores, hasJd);

    // ---- Optional AI layer: qualitative rewrite coaching only -------------
    let aiSuggestions: { type: string; text: string }[] = [];
    let rewrites: { before: string; after: string }[] = [];

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    const coachingSystemPrompt = `You are a resume editor. You DO NOT score resumes — scores are already computed elsewhere and you must never output numbers as scores.
Return: (1) 3-5 qualitative, specific coaching notes about wording, positioning and relevance, and (2) up to 3 concrete bullet rewrites taken verbatim from the resume with an improved version.
Rewrites must only use facts present in the resume. Never invent metrics, employers or dates.`;

    const coachingRequest = {
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: coachingSystemPrompt },
        {
          role: "user",
          content: `Resume:\n\n${safeText}\n\n${
            hasJd ? `Target job${jobTitle ? ` (${jobTitle})` : ""}:\n\n${safeJd}\n\n` : targetRole ? `Target role: ${targetRole}\n\n` : ""
          }Measured weaknesses to address: ${
            scores.evidence.filter((e) => !e.ok).map((e) => `${e.label} — ${e.detail}`).join("; ") || "none"
          }`,
        },
      ],
      tools: [{
        type: "function",
        function: {
          name: "resume_coaching",
          description: "Qualitative resume coaching",
          parameters: {
            type: "object",
            properties: {
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
              rewrites: {
                type: "array",
                items: {
                  type: "object",
                  properties: { before: { type: "string" }, after: { type: "string" } },
                  required: ["before", "after"],
                },
              },
            },
            required: ["suggestions"],
          },
        },
      }],
      tool_choice: { type: "function", function: { name: "resume_coaching" } },
    };

    /** Scores are the source of truth; coaching is layered on top. */
    const buildPayload = () => ({
      ats_score: scores.ats_score,
      keyword_match: scores.keyword_match,
      formatting_score: scores.formatting_score,
      impact_score: scores.impact_score,
      readability_score: scores.readability_score,
      metrics: scores.metrics,
      evidence: scores.evidence,
      suggestions: [...ruleSuggestions, ...aiSuggestions],
      rewrites,
      tailoredTo: hasJd ? (jobTitle || "the pasted job description") : null,
    });

    // ------------------------- streamed analysis ---------------------------
    // Deterministic scores land first as a usable partial result, then the
    // coaching layer streams in on top of them.
    if (wantsStream) {
      meteredUserId = null; // ownership moves into the stream handler
      return sseResponse(corsHeaders, async (writer, signal) => {
        writer.stage("parse", "Reading your resume", 0.15);
        writer.stage("score", "Scoring structure, keywords and impact", 0.45);
        // Everything measurable is already known — show it now.
        writer.send("partial", buildPayload());

        if (!LOVABLE_API_KEY) {
          writer.stage("done", "Analysis ready", 1);
          writer.send("result", buildPayload());
          return;
        }

        writer.stage("coach", "Writing coaching notes and rewrites", 0.6);
        try {
          const streamed = await streamGatewayChat({
            apiKey: LOVABLE_API_KEY,
            body: coachingRequest,
            signal,
            onToolArgs: (_name, _delta, all) => {
              writer.stage("coach", "Writing coaching notes and rewrites", Math.min(0.95, 0.6 + (all.length / 2200) * 0.35));
            },
          });
          if (streamed.ok) {
            const args = streamed.toolArgs["resume_coaching"] ?? Object.values(streamed.toolArgs)[0];
            if (args) {
              const parsed = JSON.parse(args);
              aiSuggestions = Array.isArray(parsed.suggestions) ? parsed.suggestions.slice(0, 6) : [];
              rewrites = Array.isArray(parsed.rewrites) ? parsed.rewrites.slice(0, 3) : [];
            }
          } else {
            console.warn("AI coaching unavailable:", streamed.status);
          }
        } catch (aiErr) {
          if (signal.aborted) return;
          console.error("AI coaching failed:", aiErr);
        }

        writer.stage("done", "Analysis ready", 1);
        writer.send("result", buildPayload());
      });
    }

    if (LOVABLE_API_KEY) {
      try {
        const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify(coachingRequest),
        });

        if (response.ok) {
          const data = await response.json();
          const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
          if (toolCall) {
            const parsed = JSON.parse(toolCall.function.arguments);
            aiSuggestions = Array.isArray(parsed.suggestions) ? parsed.suggestions.slice(0, 6) : [];
            rewrites = Array.isArray(parsed.rewrites) ? parsed.rewrites.slice(0, 3) : [];
          }
        } else if (response.status === 429 || response.status === 402) {
          console.warn("AI coaching unavailable:", response.status);
        } else {
          console.error("AI gateway error:", response.status, await response.text());
        }
      } catch (aiErr) {
        // Scoring stands on its own — AI coaching is strictly additive.
        console.error("AI coaching failed:", aiErr);
      }
    }

    return new Response(JSON.stringify(buildPayload()), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    console.error("analyze-resume error:", e);
    if (meteredUserId) await refund(meteredUserId, "resume", paymentEnv);
    return new Response(JSON.stringify({ error: "An internal error occurred. Please try again." }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
