import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const RATE_LIMIT = 4;
const WINDOW_MS = 60_000;
const userHits = new Map<string, number[]>();

function checkRateLimit(userId: string) {
  const now = Date.now();
  const hits = (userHits.get(userId) || []).filter((t) => now - t < WINDOW_MS);
  if (hits.length >= RATE_LIMIT) return false;
  hits.push(now);
  userHits.set(userId, hits);
  return true;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return json({ error: "Unauthorized" }, 401);
    if (!checkRateLimit(user.id)) return json({ error: "Too many plan requests. Try again shortly." }, 429);

    // Every signal is read server-side under the caller's RLS context.
    const [prefsRes, resumeRes, trackedRes, matchRes, sessionRes] = await Promise.all([
      supabase.from("user_preferences").select("target_role, target_roles, industries, salary_min, salary_max, locations, remote_preference, experience_level").eq("user_id", user.id).maybeSingle(),
      supabase.from("resumes").select("file_name, version_label, ats_score, keyword_match, formatting_score, impact_score, readability_score").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1),
      supabase.from("tracked_jobs").select("title, company, status, applied_at, updated_at, match_score").eq("user_id", user.id).order("updated_at", { ascending: false }).limit(25),
      supabase.from("job_matches").select("job_title, company, match_score, missing_skills").eq("user_id", user.id).order("created_at", { ascending: false }).limit(10),
      supabase.from("interview_sessions").select("created_at, overall_score").eq("user_id", user.id).order("created_at", { ascending: false }).limit(5),
    ]);

    const context = {
      preferences: prefsRes.data ?? null,
      latestResume: resumeRes.data?.[0] ?? null,
      pipeline: trackedRes.data ?? [],
      topMatches: matchRes.data ?? [],
      recentInterviews: sessionRes.data ?? [],
      today: new Date().toISOString().slice(0, 10),
    };

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content:
              "You are a job-search operator. From a candidate's real data, sequence a concrete next-3-days plan. Rules: 4-7 total steps across day 1, 2 and 3; each step has one action type (apply, tailor, outreach, interview_prep, research); each step is 15-60 minutes; reference the candidate's actual companies, roles and scores — never invent employers, contacts or numbers; order steps so tailoring precedes applying and prep precedes interviews. Write in short, direct second person.",
          },
          { role: "user", content: `Candidate data JSON:\n${JSON.stringify(context).slice(0, 9000)}` },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "submit_plan",
              description: "Return the sequenced next-3-days plan.",
              parameters: {
                type: "object",
                properties: {
                  summary: { type: "string" },
                  steps: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        id: { type: "string" },
                        day: { type: "number" },
                        order: { type: "number" },
                        type: { type: "string", enum: ["apply", "tailor", "outreach", "interview_prep", "research"] },
                        title: { type: "string" },
                        detail: { type: "string" },
                        minutes: { type: "number" },
                        target: { type: "string" },
                        route: { type: "string", enum: ["/jobs", "/resume", "/apply", "/interview", "/pipeline", "/match"] },
                      },
                      required: ["id", "day", "order", "type", "title", "detail", "minutes", "route"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["summary", "steps"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "submit_plan" } },
      }),
    });

    if (response.status === 429 || response.status === 402) {
      return json({ error: response.status === 429 ? "Rate limit exceeded, try again later." : "Credits exhausted." }, response.status);
    }
    if (!response.ok) {
      console.error("AI gateway error:", response.status, await response.text());
      throw new Error("Plan generation failed");
    }

    const data = await response.json();
    const args = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) throw new Error("No plan returned");
    const parsed = JSON.parse(args) as { summary: string; steps: Record<string, unknown>[] };

    const steps = (parsed.steps ?? [])
      .slice(0, 8)
      .map((s, i) => ({
        id: String(s.id ?? `step-${i + 1}`).slice(0, 64),
        day: Math.min(3, Math.max(1, Number(s.day) || 1)),
        order: Number(s.order) || i + 1,
        type: String(s.type ?? "research"),
        title: String(s.title ?? "").slice(0, 160),
        detail: String(s.detail ?? "").slice(0, 600),
        minutes: Math.min(120, Math.max(5, Number(s.minutes) || 30)),
        target: s.target ? String(s.target).slice(0, 160) : null,
        route: String(s.route ?? "/"),
        done: false,
        completed_at: null as string | null,
      }))
      .sort((a, b) => a.day - b.day || a.order - b.order);

    const validUntil = new Date();
    validUntil.setDate(validUntil.getDate() + 3);

    const { data: saved, error: saveError } = await supabase
      .from("career_plans")
      .upsert(
        {
          user_id: user.id,
          summary: String(parsed.summary ?? "").slice(0, 500),
          steps,
          valid_until: validUntil.toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      )
      .select("id, summary, steps, valid_until, updated_at")
      .maybeSingle();

    if (saveError) {
      console.error("career-plan save error:", saveError.message);
      return json({ plan: { summary: parsed.summary, steps, valid_until: validUntil.toISOString() }, persisted: false });
    }

    return json({ plan: saved, persisted: true });
  } catch (e) {
    console.error("career-plan error:", e);
    return json({ error: "An internal error occurred. Please try again." }, 500);
  }
});
