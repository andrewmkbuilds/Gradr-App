import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { assertSafeUrl, FirecrawlError, scrape } from "../_shared/firecrawl.ts";
import { checkRateLimit as durableRateLimit } from "../_shared/rateLimit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const ENDPOINT = "parse-job-url";
const RATE_LIMIT = 15;
const WINDOW_SECONDS = 60;

/** Durable, cross-instance limit (see _shared/rateLimit.ts). Fails closed. */
async function checkRateLimit(userId: string): Promise<{ ok: boolean; retryAfter?: number }> {
  const r = await durableRateLimit(userId, ENDPOINT, RATE_LIMIT, WINDOW_SECONDS);
  return { ok: r.allowed, retryAfter: r.retry_after };
}

const JOB_SCHEMA = {
  type: "object",
  properties: {
    title: { type: ["string", "null"] },
    company: { type: ["string", "null"] },
    location: { type: ["string", "null"] },
    remote: { type: ["boolean", "null"] },
    employment_type: { type: ["string", "null"], description: "e.g. Full-time, Contract, Internship" },
    salary_min: { type: ["number", "null"] },
    salary_max: { type: ["number", "null"] },
    salary_currency: { type: ["string", "null"] },
    description: { type: ["string", "null"] },
    responsibilities: { type: "array", items: { type: "string" } },
    requirements: { type: "array", items: { type: "string" } },
    skills: { type: "array", items: { type: "string" } },
    benefits: { type: "array", items: { type: "string" } },
  },
  required: ["title"],
} as const;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized", code: "unauthorized" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return json({ error: "Unauthorized", code: "unauthorized" }, 401);

    const rl = await checkRateLimit(user.id);
    if (!rl.ok) {
      return json({ error: `Too many imports. Try again in ${rl.retryAfter}s.`, code: "rate_limited" }, 429);
    }

    const { url } = await req.json();
    if (!url || typeof url !== "string") return json({ error: "A job link is required.", code: "invalid_url" }, 400);

    const safe = assertSafeUrl(url);

    // Primary extraction: Firecrawl structured JSON + markdown (handles JS-heavy pages).
    let extracted: Record<string, unknown> | null = null;
    let markdown = "";
    let extractionSource: "firecrawl" | "fallback_fetch" = "firecrawl";

    try {
      const doc = await scrape(safe.toString(), {
        formats: ["markdown", { type: "json", schema: JOB_SCHEMA }],
        onlyMainContent: true,
        waitFor: 1500,
      });
      markdown = (doc.markdown ?? "").slice(0, 12_000);
      if (doc.json && typeof doc.json === "object") extracted = doc.json as Record<string, unknown>;
    } catch (e) {
      if (e instanceof FirecrawlError && (e.code === "no_credits" || e.code === "rate_limited")) {
        return json({ error: e.message, code: e.code }, e.status);
      }
      // Fall back to a plain fetch before giving up.
      extractionSource = "fallback_fetch";
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 8000);
        const r = await fetch(safe.toString(), {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; GradrBot/1.0)" },
          redirect: "follow",
          signal: ctrl.signal,
        });
        clearTimeout(timer);
        if (r.ok) {
          markdown = (await r.text())
            .slice(0, 200_000)
            .replace(/<script[\s\S]*?<\/script>/gi, " ")
            .replace(/<style[\s\S]*?<\/style>/gi, " ")
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .slice(0, 10_000);
        }
      } catch { /* handled below */ }

      if (!markdown) {
        const known = e instanceof FirecrawlError ? e : null;
        return json({
          error: known?.message ?? "That page could not be read automatically. Paste the job description manually instead.",
          code: known?.code ?? "extraction_failed",
        }, known?.status ?? 422);
      }
    }

    // Gemini normalises / fills gaps from the page text. Never invents values.
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
              "You normalise scraped job postings. Only use information present in the supplied page content. Use null or an empty array when a field is genuinely absent — never guess or invent salaries, companies, or requirements.",
          },
          {
            role: "user",
            content: `URL: ${url}\n\nPre-extracted fields (may be incomplete):\n${JSON.stringify(extracted ?? {})}\n\nPage content:\n${markdown || "(none)"}`,
          },
        ],
        tools: [{
          type: "function",
          function: { name: "extract_job", description: "Normalised job posting", parameters: JOB_SCHEMA },
        }],
        tool_choice: { type: "function", function: { name: "extract_job" } },
      }),
    });

    if (!resp.ok) {
      if (resp.status === 429) return json({ error: "AI is busy. Try again in a moment.", code: "rate_limited" }, 429);
      if (resp.status === 402) return json({ error: "AI credits exhausted.", code: "no_credits" }, 402);
      console.error(`AI error ${resp.status}: ${await resp.text()}`);
      return json({ error: "The job could not be analysed. Try again.", code: "ai_failed" }, 502);
    }

    const data = await resp.json();
    const tc = data.choices?.[0]?.message?.tool_calls?.[0];
    const result = tc ? JSON.parse(tc.function.arguments) : null;
    if (!result?.title) {
      return json({
        error: "No job posting was recognised on that page. Check the link points directly at a job ad.",
        code: "not_a_job",
      }, 422);
    }

    const arr = (v: unknown) => (Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim()) : []);
    const payload = {
      title: result.title,
      company: result.company ?? null,
      location: result.location ?? null,
      remote: result.remote ?? false,
      employment_type: result.employment_type ?? null,
      salary_min: result.salary_min ?? null,
      salary_max: result.salary_max ?? null,
      salary_currency: result.salary_currency ?? null,
      description: result.description ?? null,
      responsibilities: arr(result.responsibilities),
      requirements: arr(result.requirements),
      skills: arr(result.skills),
      benefits: arr(result.benefits),
    };

    // Be honest about what could not be extracted.
    const missingFields = Object.entries(payload)
      .filter(([, v]) => v === null || (Array.isArray(v) && v.length === 0))
      .map(([k]) => k);

    return json({ ...payload, url, extractionSource, missingFields });
  } catch (e) {
    if (e instanceof FirecrawlError) return json({ error: e.message, code: e.code }, e.status);
    console.error("parse-job-url error:", e);
    return json({ error: "Something failed while importing the job. Please try again.", code: "internal" }, 500);
  }
});
