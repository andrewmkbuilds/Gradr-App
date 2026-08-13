import { createClient } from "./shared/supabase";

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

const ACTION_KINDS = ["apply", "tailor", "outreach", "prep", "research"] as const;

interface PlanStep {
  id: string;
  day: 1 | 2 | 3;
  kind: (typeof ACTION_KINDS)[number];
  title: string;
  detail: string;
  minutes: number;
  to: string;
  done: boolean;
}

interface TrackedRow {
  title: string;
  company: string | null;
  status: string;
  applied_at: string | null;
  last_touch_at: string | null;
  match_score: number | null;
}

interface ReminderRow {
  title: string;
  due_at: string;
}

const ROUTE_FOR: Record<string, string> = {
  apply: "/jobs",
  tailor: "/resume",
  outreach: "/pipeline",
  prep: "/interview",
  research: "/growth",
};

export const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const supabase = createClient(
      process.env["SUPABASE_URL"]!,
      process.env["SUPABASE_PUBLISHABLE_KEY"]!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) return json({ error: "Unauthorized" }, 401);
    if (!checkRateLimit(user.id)) return json({ error: "Too many plan requests. Try again shortly." }, 429);

    // ---- gather the real signals the plan must be grounded in ----------------
    const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString();
    const [prefsRes, resumeRes, trackedRes, remindersRes, sessionsRes] = await Promise.all([
      supabase.from("user_preferences").select("*").eq("user_id", user.id).maybeSingle(),
      supabase
        .from("resumes")
        .select("ats_score, keyword_match, formatting_score, impact_score, version_label, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1),
      supabase
        .from("tracked_jobs")
        .select("title, company, status, applied_at, last_touch_at, match_score, updated_at")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false })
        .limit(25),
      supabase
        .from("job_reminders")
        .select("title, due_at")
        .eq("user_id", user.id)
        .eq("done", false)
        .order("due_at")
        .limit(10),
      supabase
        .from("interview_sessions")
        .select("id, created_at")
        .eq("user_id", user.id)
        .gte("created_at", weekAgo),
    ]);

    const prefs = prefsRes.data as Record<string, unknown> | null;
    const resume = resumeRes.data?.[0] ?? null;
    const tracked = trackedRes.data ?? [];
    const reminders = remindersRes.data ?? [];
    const sessionsThisWeek = sessionsRes.data?.length ?? 0;

    const context = {
      targetRoles: (prefs?.["target_roles"] as string[] | null) ?? (prefs?.["target_role"] ? [prefs["target_role"]] : []),
      industries: (prefs?.["industries"] as string[] | null) ?? [],
      salaryMin: prefs?.["salary_min"] ?? null,
      resume: resume
        ? {
            atsScore: resume.ats_score,
            keywordMatch: resume.keyword_match,
            formatting: resume.formatting_score,
            impact: resume.impact_score,
          }
        : null,
      pipeline: (tracked as TrackedRow[]).map((t) => ({
        title: t.title,
        company: t.company,
        status: t.status,
        appliedAt: t.applied_at,
        lastTouchAt: t.last_touch_at,
        matchScore: t.match_score,
      })),
      openReminders: (reminders as ReminderRow[]).map((r) => ({ title: r.title, dueAt: r.due_at })),
      mockInterviewsThisWeek: sessionsThisWeek,
    };

    const LOVABLE_API_KEY = process.env["LOVABLE_API_KEY"];
    if (!LOVABLE_API_KEY) return json({ error: "AI is not configured." }, 503);

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content:
              "You are a job-search operator. From a candidate's real data, sequence a concrete 3-day action plan (today, tomorrow, day after). Rules: 2-3 steps per day; each step 15-60 minutes; order matters — tailor before applying, apply before outreach, prep before an interview date; reference the candidate's actual roles and companies by name when the data contains them; never invent companies, jobs or facts that are not in the data; if the data is thin, prioritise the setup step that unblocks everything else.",
          },
          { role: "user", content: JSON.stringify(context).slice(0, 12_000) },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "submit_plan",
              description: "Return a sequenced 3-day action plan.",
              parameters: {
                type: "object",
                properties: {
                  summary: { type: "string", description: "One sentence on the strategy for the next 3 days." },
                  steps: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        day: { type: "number", enum: [1, 2, 3] },
                        kind: { type: "string", enum: [...ACTION_KINDS] },
                        title: { type: "string" },
                        detail: { type: "string" },
                        minutes: { type: "number" },
                      },
                      required: ["day", "kind", "title", "detail", "minutes"],
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

    if (response.status === 429) return json({ error: "Rate limit exceeded, try again later." }, 429);
    if (response.status === 402) return json({ error: "AI credits exhausted." }, 402);
    if (!response.ok) {
      console.error("AI gateway error:", response.status, await response.text());
      return json({ error: "Plan generation failed." }, 502);
    }

    const data = await response.json();
    const args = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) return json({ error: "No plan returned." }, 502);
    const parsed = JSON.parse(args) as { summary: string; steps: Omit<PlanStep, "id" | "to" | "done">[] };

    const steps: PlanStep[] = (parsed.steps ?? []).slice(0, 9).map((s, i) => ({
      id: `s${i + 1}`,
      day: (s.day === 2 || s.day === 3 ? s.day : 1) as 1 | 2 | 3,
      kind: ACTION_KINDS.includes(s.kind) ? s.kind : "apply",
      title: String(s.title).slice(0, 140),
      detail: String(s.detail).slice(0, 400),
      minutes: Math.max(10, Math.min(90, Math.round(Number(s.minutes) || 30))),
      to: ROUTE_FOR[s.kind] ?? "/",
      done: false,
    }));

    if (steps.length === 0) return json({ error: "No plan returned." }, 502);

    const validUntil = new Date(Date.now() + 3 * 864e5).toISOString();
    const { data: saved, error: saveError } = await supabase
      .from("career_plans")
      .insert({
        user_id: user.id,
        summary: String(parsed.summary ?? "").slice(0, 400),
        steps,
        valid_until: validUntil,
      })
      .select("id, summary, steps, valid_until, created_at")
      .single();

    if (saveError) {
      console.error("career-plan save error:", saveError);
      return json({ error: "Couldn't save the plan." }, 500);
    }

    return json({ plan: saved });
  } catch (e) {
    console.error("career-plan error:", e);
    return json({ error: "An internal error occurred. Please try again." }, 500);
  }
};
