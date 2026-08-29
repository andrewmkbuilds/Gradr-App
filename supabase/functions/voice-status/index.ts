import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { planTier, resolveEnv } from "../_shared/entitlements.ts";
import { corsHeaders, jsonResponse as json, serviceClient } from "../_shared/voiceProvider.ts";

/**
 * Voice health for the candidate-facing widget.
 *
 * Answers three questions without exposing anything sensitive: is the voice
 * backend configured, is this account entitled to studio voice, and what was
 * the exact last failure (Gradr code + enumerated provider reason).
 */

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

  const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
  const tier = await planTier(user.id, resolveEnv(body.environment));
  const entitled = new Set(["starter", "pro", "advanced"]).has(tier);
  const configured = Boolean(
    Deno.env.get("DEEPGRAM_API_KEY") ??
      Deno.env.get("ELEVENLABS_API_KEY") ??
      Deno.env.get("FISH_AUDIO_API_KEY"),
  );

  const { data: events } = await serviceClient()
    .from("voice_provider_events")
    .select("outcome, code, provider_reason, upstream_status, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(10);

  const list = events ?? [];
  const lastFailure = list.find((e) => e.outcome === "failure") ?? null;
  const lastSuccess = list.find((e) => e.outcome === "ok") ?? null;
  const healthy = configured && entitled &&
    (!lastFailure || (lastSuccess && lastSuccess.created_at > lastFailure.created_at));

  return json({
    configured,
    entitled,
    tier,
    healthy: Boolean(healthy),
    lastFailure: lastFailure
      ? {
        code: lastFailure.code,
        reason: lastFailure.provider_reason,
        upstreamStatus: lastFailure.upstream_status,
        at: lastFailure.created_at,
      }
      : null,
    lastSuccessAt: lastSuccess?.created_at ?? null,
  });
});
