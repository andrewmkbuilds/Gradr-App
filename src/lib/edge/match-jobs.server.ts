import { createClient } from "./shared/supabase";
import { scoreJobAgainstResume } from "./shared/matching";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const RATE_LIMIT = 15;
const WINDOW_MS = 60_000;
const userHits = new Map<string, number[]>();

function checkRateLimit(userId: string): { ok: boolean; retryAfter?: number } {
  const now = Date.now();
  const hits = (userHits.get(userId) || []).filter((t) => now - t < WINDOW_MS);
  if (hits.length >= RATE_LIMIT) {
    return { ok: false, retryAfter: Math.ceil((WINDOW_MS - (now - hits[0])) / 1000) };
  }
  hits.push(now);
  userHits.set(userId, hits);
  return { ok: true };
}

const ALLOWED_COUNTRIES = ["us","gb","ca","au","de","fr","in","nl","at","be","br","ch","es","it","mx","nz","pl","sg","za"];

interface AdzunaResult {
  id: string;
  title: string;
  company?: { display_name?: string };
  location?: { display_name?: string };
  description?: string;
  redirect_url: string;
  salary_min?: number;
  salary_max?: number;
  created?: string;
}

export const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const supabase = createClient(
      process.env['SUPABASE_URL']!,
      process.env['SUPABASE_PUBLISHABLE_KEY']!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return json({ error: "Unauthorized" }, 401);

    const rl = checkRateLimit(user.id);
    if (!rl.ok) return json({ error: `Rate limit exceeded. Try again in ${rl.retryAfter}s.` }, 429);

    const body = await req.json().catch(() => ({}));
    const resumeText = String(body.resumeText ?? "").slice(0, 80_000);
    if (!resumeText.trim()) return json({ error: "resumeText is required" }, 400);

    const targetRole = body.targetRole ? String(body.targetRole).slice(0, 200) : "";
    const where = body.location ? String(body.location).slice(0, 120) : "";
    const rawCountry = String(body.country ?? "us").toLowerCase();
    const country = ALLOWED_COUNTRIES.includes(rawCountry) ? rawCountry : "us";
    const remoteOnly = Boolean(body.remoteOnly);

    const APP_ID = process.env['ADZUNA_APP_ID'];
    const APP_KEY = process.env['ADZUNA_APP_KEY'];
    if (!APP_ID || !APP_KEY) return json({ error: "Job source is not configured." }, 503);

    const params = new URLSearchParams({
      app_id: APP_ID,
      app_key: APP_KEY,
      results_per_page: "30",
      what: targetRole || "",
      "content-type": "application/json",
    });
    if (where) params.set("where", where);

    const res = await fetch(
      `https://api.adzuna.com/v1/api/jobs/${country}/search/1?${params.toString()}`,
    );
    if (!res.ok) {
      console.error("Adzuna error", res.status, await res.text());
      return json({ error: "Couldn't reach the job source right now." }, 502);
    }

    const data = await res.json();
    const results: AdzunaResult[] = data.results || [];

    const matches = results
      .map((r) => {
        const description = r.description || "";
        const isRemote = /\bremote\b|\bwork from home\b|\bwfh\b/i.test(`${r.title} ${description}`);
        const breakdown = scoreJobAgainstResume({
          resumeText,
          jobTitle: r.title,
          jobDescription: description,
          targetRole,
        });
        return {
          external_id: String(r.id),
          source: "adzuna",
          title: r.title,
          company: r.company?.display_name ?? null,
          location: r.location?.display_name ?? null,
          remote: isRemote,
          url: r.redirect_url,
          salary_min: r.salary_min ? Math.round(r.salary_min) : null,
          salary_max: r.salary_max ? Math.round(r.salary_max) : null,
          posted_at: r.created ?? null,
          description,
          match: breakdown,
        };
      })
      .filter((j) => (remoteOnly ? j.remote : true))
      .sort((a, b) => b.match.score - a.match.score)
      .slice(0, 12);

    return json({
      matches,
      total_scanned: results.length,
      method: "deterministic_keyword_overlap",
      source: "adzuna",
    });
  } catch (e) {
    console.error("match-jobs error:", e);
    return json({ error: "An internal error occurred. Please try again." }, 500);
  }
};
