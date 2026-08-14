import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { planTier, resolveEnv } from "../_shared/entitlements.ts";

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

/**
 * Gradr voice error vocabulary. Mirrored in src/lib/interview/voiceErrors.ts.
 * The provider's own wording NEVER crosses this boundary — it is logged here
 * and the client only receives one of these codes.
 */
type VoiceErrorCode =
  | "VOICE_UNAVAILABLE"
  | "VOICE_CONNECTION_FAILED"
  | "VOICE_RATE_LIMITED"
  | "VOICE_CONFIGURATION_ERROR"
  | "VOICE_TIMEOUT"
  | "VOICE_NOT_ENTITLED"
  | "VOICE_SESSION_EXPIRED";

/** Classifies an upstream provider failure into a Gradr code. */
function classifyProviderFailure(status: number): { code: VoiceErrorCode; status: number } {
  // 401/403 mean the provider rejected our credentials, key permissions or
  // account standing — always an operator problem, never the candidate's.
  if (status === 401 || status === 403) return { code: "VOICE_CONFIGURATION_ERROR", status: 503 };
  if (status === 429) return { code: "VOICE_RATE_LIMITED", status: 429 };
  if (status === 408 || status === 504) return { code: "VOICE_TIMEOUT", status: 504 };
  if (status >= 500) return { code: "VOICE_UNAVAILABLE", status: 503 };
  return { code: "VOICE_CONNECTION_FAILED", status: 502 };
}

function voiceError(code: VoiceErrorCode, status: number, requestId: string) {
  return json({ code, requestId }, status);
}

function providerDetail(raw: string) {
  if (!raw) return "No detail returned by the voice provider.";
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

  const requestId = crypto.randomUUID();
  try {
    console.info("[voice] streamed TTS request received", { requestId });
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      console.error("[voice] request rejected — missing app authorization", { requestId });
      return voiceError("VOICE_SESSION_EXPIRED", 401, requestId);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      console.error("[voice] request rejected — invalid app session", { requestId });
      return voiceError("VOICE_SESSION_EXPIRED", 401, requestId);
    }

    if (rateLimited(user.id)) {
      console.warn("[voice] local rate limit hit", { requestId, userId: user.id });
      return voiceError("VOICE_RATE_LIMITED", 429, requestId);
    }

    const body = await req.json().catch(() => ({}));
    const tier = await planTier(user.id, resolveEnv(body.environment));
    if (!new Set(["starter", "pro", "advanced"]).has(tier)) {
      console.warn("[voice] denied — studio voice entitlement required", { requestId, userId: user.id, tier });
      return voiceError("VOICE_NOT_ENTITLED", 403, requestId);
    }
    const text = typeof body.text === "string" ? body.text.trim().slice(0, 1200) : "";
    if (!text) return json({ code: "VOICE_UNAVAILABLE", requestId, error: "text is required" }, 400);

    const personaId = typeof body.personaId === "string" ? body.personaId : "hiring-manager";
    const profile = VOICE_PROFILES[personaId] ?? VOICE_PROFILES["hiring-manager"];
    console.info("[voice] persona resolved", { requestId, personaId, voiceConfigured: Boolean(profile.voiceId) });
    const previousText = typeof body.previousText === "string" ? body.previousText.slice(-400) : "";
    const nextText = typeof body.nextText === "string" ? body.nextText.slice(0, 400) : "";

    const apiKey = Deno.env.get("ELEVENLABS_API_KEY");
    if (!apiKey) {
      console.error("[voice] provider credential missing — ELEVENLABS_API_KEY unavailable", { requestId });
      return voiceError("VOICE_CONFIGURATION_ERROR", 503, requestId);
    }
    console.info("[voice] provider credential present", { requestId });

    // One retry: transient 429/5xx from the provider shouldn't drop a thought.
    let res: Response | null = null;
    let networkError = false;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        res = await synthesize(apiKey, profile, text, previousText, nextText);
      } catch (e) {
        networkError = true;
        console.error("[voice] provider request threw", { requestId, error: String(e) });
        res = null;
      }
      if (res && res.ok) break;
      if (res && res.status < 500 && res.status !== 429) break;
      if (attempt === 0) await new Promise((r) => setTimeout(r, 350));
    }

    if (!res || !res.ok || !res.body) {
      const upstreamStatus = res?.status ?? 0;
      const rawDetail = res ? await res.text().catch(() => "") : "no response body";
      // Server-side only: the full provider detail is diagnosable from logs and
      // is deliberately excluded from the response payload.
      console.error("[voice] provider failure", {
        requestId,
        userId: user.id,
        personaId,
        upstreamStatus,
        providerDetail: providerDetail(rawDetail),
      });
      const mapped = networkError && !res
        ? { code: "VOICE_CONNECTION_FAILED" as VoiceErrorCode, status: 502 }
        : classifyProviderFailure(upstreamStatus);
      return voiceError(mapped.code, mapped.status, requestId);
    }

    console.info("[voice] audio stream started", { requestId, personaId });

    return new Response(res.body, {
      headers: { ...corsHeaders, "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
    });
  } catch (e) {
    console.error("[voice] unhandled failure", e);
    return json({ code: "VOICE_UNAVAILABLE" }, 500);
  }
});
