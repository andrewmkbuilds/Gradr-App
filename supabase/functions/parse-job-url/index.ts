import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RATE_LIMIT = 15;
const WINDOW_MS = 60_000;
const userHits = new Map<string, number[]>();
function checkRateLimit(userId: string) {
  const now = Date.now();
  const hits = (userHits.get(userId) || []).filter((t) => now - t < WINDOW_MS);
  if (hits.length >= RATE_LIMIT) return { ok: false, retryAfter: Math.ceil((WINDOW_MS - (now - hits[0])) / 1000) };
  hits.push(now); userHits.set(userId, hits);
  return { ok: true as const };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const rl = checkRateLimit(user.id);
    if (!rl.ok) return new Response(JSON.stringify({ error: `Rate limit. Retry in ${rl.retryAfter}s.` }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { url } = await req.json();
    if (!url || typeof url !== "string") {
      return new Response(JSON.stringify({ error: "url required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // SSRF guard: validate URL scheme + host before fetching
    const isSafeJobUrl = async (raw: string): Promise<{ ok: true; url: URL } | { ok: false; reason: string }> => {
      let parsed: URL;
      try { parsed = new URL(raw); } catch { return { ok: false, reason: "Invalid URL" }; }
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        return { ok: false, reason: "Only http(s) URLs allowed" };
      }
      const host = parsed.hostname.toLowerCase();
      // Block obvious internal hostnames
      if (
        host === "localhost" ||
        host === "0.0.0.0" ||
        host.endsWith(".local") ||
        host.endsWith(".internal")
      ) return { ok: false, reason: "Internal hostnames are not allowed" };
      // Block literal IPs in private / loopback / link-local ranges
      const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
      if (ipv4) {
        const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
        if (
          a === 10 ||
          a === 127 ||
          (a === 169 && b === 254) ||
          (a === 172 && b >= 16 && b <= 31) ||
          (a === 192 && b === 168) ||
          a === 0 || a >= 224
        ) return { ok: false, reason: "Private IPs are not allowed" };
      }
      // Block IPv6 literals (covers ::1, fc00::/7, fe80::/10, etc. conservatively)
      if (host.includes(":") || host.startsWith("[")) {
        return { ok: false, reason: "IPv6 literals are not allowed" };
      }
      return { ok: true, url: parsed };
    };

    const safety = await isSafeJobUrl(url);
    if (!safety.ok) {
      return new Response(JSON.stringify({ error: safety.reason }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch page HTML with a strict timeout + size cap; redirects auto-followed, but each
    // hop's final URL is still subject to network egress restrictions in the runtime.
    let pageText = "";
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 6000);
      const r = await fetch(safety.url.toString(), {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; CareerFlowBot/1.0)" },
        redirect: "follow",
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (r.ok) {
        const ct = r.headers.get("content-type") || "";
        if (ct.includes("text/") || ct.includes("html") || ct.includes("json") || ct === "") {
          const html = (await r.text()).slice(0, 200_000);
          pageText = html
            .replace(/<script[\s\S]*?<\/script>/gi, " ")
            .replace(/<style[\s\S]*?<\/style>/gi, " ")
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .slice(0, 8000);
        }
      }
    } catch (_) { /* ignore — AI will use URL alone */ }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY missing");

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "Extract structured job posting details. Use null when unknown." },
          { role: "user", content: `URL: ${url}\n\nPage text:\n${pageText || "(unavailable — infer from URL only)"}` },
        ],
        tools: [{
          type: "function",
          function: {
            name: "extract_job",
            description: "Extract job details",
            parameters: {
              type: "object",
              properties: {
                title: { type: "string" },
                company: { type: ["string", "null"] },
                location: { type: ["string", "null"] },
                remote: { type: "boolean" },
                description: { type: ["string", "null"] },
                salary_min: { type: ["number", "null"] },
                salary_max: { type: ["number", "null"] },
              },
              required: ["title", "remote"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "extract_job" } },
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
    const result = tc ? JSON.parse(tc.function.arguments) : null;
    if (!result) throw new Error("Failed to parse AI response");

    return new Response(JSON.stringify({ ...result, url }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("parse-job-url error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
