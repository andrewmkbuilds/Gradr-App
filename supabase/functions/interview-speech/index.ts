import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Interviewer speech (ElevenLabs).
 *
 * Voices one spoken thought at a time so the client can start playback while
 * the reasoning model is still generating the rest of the turn. The persona ->
 * voice mapping and the delivery settings are resolved here, server-side, so a
 * client can never point the interviewer at an arbitrary voice.
 *
 * ELEVENLABS_API_KEY never leaves this function.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface VoiceProfile {
  voiceId: string;
  stability: number;
  similarityBoost: number;
  style: number;
  speed: number;
}

function safeProviderDetail(raw: string) {
  if (!raw) return "No error detail returned by ElevenLabs.";
  try {
    const parsed = JSON.parse(raw);
    const detail = parsed?.detail;
    if (typeof detail?.message === "string") return detail.message.slice(0, 300);
    if (typeof detail === "string") return detail.slice(0, 300);
    if (typeof parsed?.message === "string") return parsed.message.slice(0, 300);
  } catch {
    // Provider occasionally returns plain text. It never contains our API key.
  }
  return raw.slice(0, 300);
}

/** Mirrored in src/lib/interview/voiceProfiles.ts (UI labels only). */
const VOICE_PROFILES: Record<string, VoiceProfile> = {
  friendly: { voiceId: "EXAVITQu4vr4xnSDxMaL", stability: 0.42, similarityBoost: 0.78, style: 0.28, speed: 1.02 },
  "hiring-manager": { voiceId: "nPczCjzI2devNBz1zQrb", stability: 0.5, similarityBoost: 0.75, style: 0.18, speed: 0.99 },
  technical: { voiceId: "cjVigY5qzO86Huf0OWal", stability: 0.58, similarityBoost: 0.72, style: 0.12, speed: 0.97 },
  executive: { voiceId: "JBFqnCBsd6RMkjVDRZzb", stability: 0.62, similarityBoost: 0.7, style: 0.1, speed: 0.94 },
  stress: { voiceId: "iP95p4xoKVk53GoZ742B", stability: 0.38, similarityBoost: 0.8, style: 0.22, speed: 1.09 },
};

const MODEL_ID = "eleven_turbo_v2_5";
const OUTPUT_FORMAT = "mp3_44100_128";
const UPSTREAM_TIMEOUT_MS = 20_000;

// Chunked speech means many small calls per turn — this cap is per user/minute.
const RATE_LIMIT = 180;
const WINDOW_MS = 60_000;
const hits = new Map<string, number[]>();

function rateLimited(userId: string) {
  const now = Date.now();
  const list = (hits.get(userId) ?? []).filter((t) => now - t < WINDOW_MS);
  if (list.length >= RATE_LIMIT) return true;
  list.push(now);
  hits.set(userId, list);
  return false;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function synthesize(apiKey: string, profile: VoiceProfile, text: string, previousText: string, nextText: string) {
  const url =
    `https://api.elevenlabs.io/v1/text-to-speech/${profile.voiceId}/stream` +
    `?output_format=${OUTPUT_FORMAT}&optimize_streaming_latency=3`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    return await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        model_id: MODEL_ID,
        // Request stitching keeps prosody continuous across chunks of one turn.
        ...(previousText ? { previous_text: previousText } : {}),
        ...(nextText ? { next_text: nextText } : {}),
        voice_settings: {
          stability: profile.stability,
          similarity_boost: profile.similarityBoost,
          style: profile.style,
          use_speaker_boost: true,
          speed: profile.speed,
        },
      }),
    });
  } finally {
    clearTimeout(timer);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    console.info("[ElevenLabs] Initializing realtime session");
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      console.error("[ElevenLabs] Session creation: failed — missing app authorization");
      return json({ error: "Unauthorized" }, 401);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      console.error("[ElevenLabs] Session creation: failed — invalid app session");
      return json({ error: "Unauthorized" }, 401);
    }

    if (rateLimited(user.id)) return json({ error: "rate_limited" }, 429);

    const body = await req.json().catch(() => ({}));
    const text = typeof body.text === "string" ? body.text.trim().slice(0, 1200) : "";
    if (!text) return json({ error: "text is required" }, 400);

    const personaId = typeof body.personaId === "string" ? body.personaId : "hiring-manager";
    const profile = VOICE_PROFILES[personaId] ?? VOICE_PROFILES["hiring-manager"];
    console.info("[ElevenLabs] Voice ID: configured", { personaId, configured: Boolean(profile.voiceId) });
    const previousText = typeof body.previousText === "string" ? body.previousText.slice(-400) : "";
    const nextText = typeof body.nextText === "string" ? body.nextText.slice(0, 400) : "";

    const apiKey = Deno.env.get("ELEVENLABS_API_KEY");
    if (!apiKey) {
      console.error("[ElevenLabs] API authentication: failure — ELEVENLABS_API_KEY unavailable");
      console.error("[ElevenLabs] Session creation: failure");
      return json({ error: "tts_unavailable", reason: "ElevenLabs is not configured on the production backend." }, 503);
    }
    console.info("[ElevenLabs] API authentication: configured");

    // One retry: transient 429/5xx from the provider shouldn't drop a thought.
    let res: Response | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        res = await synthesize(apiKey, profile, text, previousText, nextText);
      } catch (e) {
        console.error("[ElevenLabs] Audio stream: failed", String(e));
        res = null;
      }
      if (res && res.ok) break;
      if (res && res.status < 500 && res.status !== 429) break;
      if (attempt === 0) await new Promise((r) => setTimeout(r, 350));
    }

    if (!res || !res.ok || !res.body) {
      const status = res?.status ?? 502;
      const rawDetail = res ? await res.text().catch(() => "") : "no response";
      const detail = safeProviderDetail(rawDetail);
      console.error("[ElevenLabs] API authentication:", status === 401 ? "failure" : "provider responded");
      console.error("[ElevenLabs] Session creation: failure", { status, detail });
      console.error("[ElevenLabs] WebSocket connection: failed — streaming HTTP request did not open");
      console.error("[ElevenLabs] Audio stream: failed", { status, detail });
      return json(
        { error: "tts_failed", status, reason: detail },
        status === 401 ? 502 : status,
      );
    }

    console.info("[ElevenLabs] API authentication: success");
    console.info("[ElevenLabs] Session creation: success");
    console.info("[ElevenLabs] WebSocket connection: connected (HTTP streaming transport)");
    console.info("[ElevenLabs] Audio stream: started");

    return new Response(res.body, {
      headers: { ...corsHeaders, "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
    });
  } catch (e) {
    console.error("[ElevenLabs] Session creation: failure", e);
    return json({ error: "internal_error" }, 500);
  }
});
