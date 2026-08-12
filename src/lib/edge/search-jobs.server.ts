import { createClient } from "./shared/supabase";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RATE_LIMIT = 30;
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

interface AdzunaResult {
  id: string;
  title: string;
  company: { display_name?: string };
  location: { display_name?: string };
  description: string;
  redirect_url: string;
  salary_min?: number;
  salary_max?: number;
  created: string;
  contract_time?: string;
}

export const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabase = createClient(
      process.env['SUPABASE_URL']!,
      process.env['SUPABASE_PUBLISHABLE_KEY']!,
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
      return new Response(JSON.stringify({ error: `Rate limit exceeded. Try again in ${rl.retryAfter}s.` }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const APP_ID = process.env['ADZUNA_APP_ID'];
    const APP_KEY = process.env['ADZUNA_APP_KEY'];
    if (!APP_ID || !APP_KEY) {
      return new Response(JSON.stringify({ error: "Adzuna API keys not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { what = "", where = "", country: rawCountry = "us", page: rawPage = 1, remoteOnly = false, salaryMin, sortBy = "relevance" } = await req.json();

    const ALLOWED_COUNTRIES = ["us","gb","ca","au","de","fr","in","nl","at","be","br","ch","es","it","mx","nz","pl","sg","za"];
    const country = ALLOWED_COUNTRIES.includes(String(rawCountry).toLowerCase()) ? String(rawCountry).toLowerCase() : null;
    const page = Math.max(1, Math.min(100, parseInt(String(rawPage), 10) || 1));
    if (!country) {
      return new Response(JSON.stringify({ error: "Invalid country code" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const params = new URLSearchParams({
      app_id: APP_ID,
      app_key: APP_KEY,
      results_per_page: "20",
      what: String(what),
      "content-type": "application/json",
    });
    if (where) params.set("where", String(where));
    if (salaryMin) params.set("salary_min", String(salaryMin));
    if (sortBy === "date") params.set("sort_by", "date");
    else if (sortBy === "salary") params.set("sort_by", "salary");

    const url = `https://api.adzuna.com/v1/api/jobs/${country}/search/${page}?${params.toString()}`;
    const res = await fetch(url);
    if (!res.ok) {
      const text = await res.text();
      console.error("Adzuna error", res.status, text);
      return new Response(JSON.stringify({ error: `Adzuna error: ${res.status}` }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const data = await res.json();
    const results: AdzunaResult[] = data.results || [];

    const jobs = results
      .map((r) => {
        const desc = r.description || "";
        const isRemote = /\bremote\b|\bwork from home\b|\bwfh\b/i.test(`${r.title} ${desc}`);
        return {
          external_id: r.id,
          source: "adzuna",
          title: r.title,
          company: r.company?.display_name || null,
          location: r.location?.display_name || null,
          remote: isRemote,
          url: r.redirect_url,
          salary_min: r.salary_min ? Math.round(r.salary_min) : null,
          salary_max: r.salary_max ? Math.round(r.salary_max) : null,
          description: desc,
          posted_at: r.created,
        };
      })
      .filter((j) => !remoteOnly || j.remote);

    return new Response(JSON.stringify({ jobs, total: data.count ?? jobs.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("search-jobs error:", e);
    return new Response(JSON.stringify({ error: "An internal error occurred. Please try again." }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
};
