import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Admin-only health probe for the interviewer voice provider.
 *
 * Reports whether the credential is present and whether the provider account
 * can currently synthesise speech, without ever returning the credential or a
 * raw provider payload to the browser. Detailed provider output is logged
 * server-side only.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Unauthorized" }, 401);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ error: "Unauthorized" }, 401);

  const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: user.id, _role: "admin" });
  if (!isAdmin) return json({ error: "Forbidden" }, 403);

  const apiKey = Deno.env.get("ELEVENLABS_API_KEY");
  if (!apiKey) {
    console.error("[voice-diagnostics] credential missing");
    return json({ credential: "missing", synthesis: "unavailable", code: "VOICE_CONFIGURATION_ERROR" });
  }

  // Smallest possible real synthesis: proves credential + account standing.
  const res = await fetch(
    "https://api.elevenlabs.io/v1/text-to-speech/nPczCjzI2devNBz1zQrb/stream?output_format=mp3_22050_32",
    {
      method: "POST",
      headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ text: "Voice check.", model_id: "eleven_turbo_v2_5" }),
    },
  ).catch((e) => {
    console.error("[voice-diagnostics] provider request threw", String(e));
    return null;
  });

  if (!res || !res.ok) {
    const detail = res ? await res.text().catch(() => "") : "no response";
    console.error("[voice-diagnostics] provider failure", { status: res?.status ?? 0, detail: detail.slice(0, 500) });
    return json({
      credential: "present",
      synthesis: "failing",
      upstreamStatus: res?.status ?? 0,
      code: (res?.status === 401 || res?.status === 403)
        ? "VOICE_CONFIGURATION_ERROR"
        : res?.status === 429
        ? "VOICE_RATE_LIMITED"
        : "VOICE_UNAVAILABLE",
    });
  }

  await res.body?.cancel();
  console.info("[voice-diagnostics] provider healthy");
  return json({ credential: "present", synthesis: "ok" });
});
