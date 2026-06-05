import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

    const rl = checkRateLimit(user.id);
    if (!rl.ok) {
      return new Response(
        JSON.stringify({ error: `Rate limit exceeded. Try again in ${rl.retryAfter}s.` }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": String(rl.retryAfter) } },
      );
    }

    const { type, resumeText, jobTitle, company, jobDescription, userName } = await req.json();
    if (!type || !resumeText) {
      return new Response(JSON.stringify({ error: "type and resumeText are required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    let systemPrompt = "";
    let toolName = "";
    let toolParams: any = {};

    if (type === "cover_letter") {
      systemPrompt = `You are an expert career writer. Write a compelling, personalized cover letter. Be specific, avoid generic phrases, and highlight relevant experience from the resume. Keep it under 400 words. Professional but warm tone.`;
      toolName = "generate_cover_letter";
      toolParams = {
        type: "object",
        properties: {
          subject: { type: "string", description: "Email subject line" },
          body: { type: "string", description: "Full cover letter text with paragraphs" },
        },
        required: ["subject", "body"],
      };
    } else if (type === "recruiter_message") {
      systemPrompt = `You are an expert networking strategist. Write a concise, compelling LinkedIn/email message to a recruiter or hiring manager. Be direct, show genuine interest, mention specific relevant skills. Keep it under 150 words.`;
      toolName = "generate_recruiter_message";
      toolParams = {
        type: "object",
        properties: {
          subject: { type: "string", description: "Message subject or first line" },
          body: { type: "string", description: "Full message text" },
        },
        required: ["subject", "body"],
      };
    } else if (type === "application_pack") {
      systemPrompt = `You are an expert career writer producing a complete application pack: a tailored cover letter, a short recruiter outreach message, and 3-5 rewritten resume bullet points that better target this role. Be specific, ATS-friendly, and quantitative where possible.`;
      toolName = "generate_application_pack";
      toolParams = {
        type: "object",
        properties: {
          cover_letter: {
            type: "object",
            properties: {
              subject: { type: "string" },
              body: { type: "string", description: "Full cover letter, < 350 words, paragraphs separated by blank lines" },
            },
            required: ["subject", "body"],
          },
          recruiter_message: {
            type: "object",
            properties: {
              subject: { type: "string" },
              body: { type: "string", description: "Short outreach message, < 120 words" },
            },
            required: ["subject", "body"],
          },
          bullet_rewrites: {
            type: "array",
            description: "3-5 rewritten resume bullets tailored to the job",
            items: {
              type: "object",
              properties: {
                original_hint: { type: "string", description: "Topic/area from resume this rewrites" },
                rewritten: { type: "string", description: "New bullet point, action verb + outcome + metric" },
              },
              required: ["rewritten"],
            },
          },
        },
        required: ["cover_letter", "recruiter_message", "bullet_rewrites"],
      };
    } else {
      return new Response(JSON.stringify({ error: "Invalid type. Use 'cover_letter', 'recruiter_message', or 'application_pack'" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userContent = `Resume:\n${resumeText.substring(0, 5000)}\n\nTarget Position: ${jobTitle || "Not specified"} at ${company || "Not specified"}\n${jobDescription ? `Job Description:\n${jobDescription.substring(0, 4000)}` : ""}\nApplicant Name: ${userName || "Not specified"}`;

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
          { role: "user", content: userContent },
        ],
        tools: [{
          type: "function",
          function: {
            name: toolName,
            description: `Generate a ${type.replace(/_/g, " ")}`,
            parameters: toolParams,
          },
        }],
        tool_choice: { type: "function", function: { name: toolName } },
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
      throw new Error("AI generation failed");
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    const result = toolCall ? JSON.parse(toolCall.function.arguments) : null;

    if (!result) throw new Error("Failed to parse AI response");

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-application error:", e);
    return new Response(JSON.stringify({ error: "An internal error occurred. Please try again." }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
