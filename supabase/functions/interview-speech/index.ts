import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkRateLimit as durableRateLimit } from "../_shared/rateLimit.ts";
import { planTier, resolveEnv } from "../_shared/entitlements.ts";
import {
  classifyProviderFailure,
  corsHeaders,
  jsonResponse as json,
  loadVoiceConfig,
  providerDetail,
  recordVoiceEvent,
  resolveProfile,
  type VoiceConfig,
  type VoiceErrorCode,
  type VoiceProfile,
  type VoiceProviderReason,
} from "../_shared/voiceProvider.ts";

/**
 * Interviewer speech (ElevenLabs).
 *
 * Voices one spoken thought at a time so the client can start playback while
 * the reasoning model is still generating the rest of the turn. The persona ->
 * voice mapping, model and delivery settings are resolved here, server-side
 * (with admin overrides from voice_provider_config), so a client can never
 * point the interviewer at an arbitrary voice.
 *
 * ELEVENLABS_API_KEY never leaves this function. The client receives a Gradr
 * error code plus a safe enumerated provider reason (e.g.
 * PROVIDER_UNUSUAL_ACTIVITY) so the interview UI can explain entitlement
 * problems precisely without ever surfacing provider prose.
 */

function voiceError(
  code: VoiceErrorCode,
  status: number,
  requestId: string,
  reason?: VoiceProviderReason,
) {
  return json({ code, reason: reason ?? null, requestId }, status);
}

const UPSTREAM_TIMEOUT_MS = 20_000;

// Chunked speech means many small calls per turn — this cap is per user/minute.
// Durable + shared across instances (see _shared/rateLimit.ts); fails closed.
const ENDPOINT = "interview-speech";
const RATE_LIMIT = 180;
const WINDOW_SECONDS = 60;

async function rateLimited(userId: string): Promise<boolean> {
  const r = await durableRateLimit(userId, ENDPOINT, RATE_LIMIT, WINDOW_SECONDS);
  return !r.allowed;
}

async function synthesize(
  apiKey: string,
  profile: VoiceProfile,
  config: VoiceConfig,
  text: string,
  previousText: string,
  nextText: string,
) {
  const url =
    `https://api.elevenlabs.io/v1/text-to-speech/${profile.voiceId}/stream` +
    `?output_format=${config.outputFormat}&optimize_streaming_latency=3`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    return await fetch(url, {
      method: "POST",
      signal: controller.signal,
      headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        model_id: config.modelId,
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

/**
 * Fish Audio fallback.
 *
 * ElevenLabs can hard-fail for account-level reasons (401
 * `PROVIDER_UNUSUAL_ACTIVITY`, exhausted quota, suspended key) that no retry
 * fixes. Rather than leaving the interviewer mute, we synthesise the same
 * sentence through Fish Audio when FISH_AUDIO_API_KEY is configured.
 */
async function synthesizeFallback(text: string, profile: VoiceProfile): Promise<Response | null> {
  const key = Deno.env.get("FISH_AUDIO_API_KEY");
  if (!key) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    return await fetch("https://api.fish.audio/v1/tts", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        model: Deno.env.get("FISH_AUDIO_MODEL") ?? "speech-1.6",
      },
      body: JSON.stringify({
        text,
        format: "mp3",
        latency: "balanced",
        ...(profile.fallbackVoiceId ? { reference_id: profile.fallbackVoiceId } : {}),
      }),
    });
  } catch (e) {
    console.error("[voice] fallback provider request threw", String(e));
    return null;
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

    if (await rateLimited(user.id)) {
      console.warn("[voice] local rate limit hit", { requestId, userId: user.id });
      return voiceError("VOICE_RATE_LIMITED", 429, requestId);
    }

    const body = await req.json().catch(() => ({}));
    const tier = await planTier(user.id, resolveEnv(body.environment));
    if (!new Set(["starter", "pro", "advanced"]).has(tier)) {
      console.warn("[voice] denied — studio voice entitlement required", { requestId, userId: user.id, tier });
      await recordVoiceEvent({
        userId: user.id,
        outcome: "failure",
        code: "VOICE_NOT_ENTITLED",
        requestId,
        providerDetail: `Plan tier "${tier}" does not include studio voice.`,
      });
      return voiceError("VOICE_NOT_ENTITLED", 403, requestId);
    }
    const text = typeof body.text === "string" ? body.text.trim().slice(0, 1200) : "";
    if (!text) return json({ code: "VOICE_UNAVAILABLE", requestId, error: "text is required" }, 400);

    const personaId = typeof body.personaId === "string" ? body.personaId : "hiring-manager";
    const config = await loadVoiceConfig();
    const profile = resolveProfile(personaId, config);
    console.info("[voice] persona resolved", { requestId, personaId, model: config.modelId });
    const previousText = typeof body.previousText === "string" ? body.previousText.slice(-400) : "";
    const nextText = typeof body.nextText === "string" ? body.nextText.slice(0, 400) : "";

    const apiKey = Deno.env.get("ELEVENLABS_API_KEY");
    if (!apiKey) {
      console.error("[voice] provider credential missing — ELEVENLABS_API_KEY unavailable", { requestId });
      await recordVoiceEvent({
        userId: user.id,
        outcome: "failure",
        code: "VOICE_CONFIGURATION_ERROR",
        reason: "PROVIDER_CREDENTIAL_MISSING",
        requestId,
        personaId,
        providerDetail: "No speech credential configured in the workspace.",
      });
      return voiceError("VOICE_CONFIGURATION_ERROR", 503, requestId, "PROVIDER_CREDENTIAL_MISSING");
    }

    // One retry: transient 429/5xx from the provider shouldn't drop a thought.
    let res: Response | null = null;
    let networkError = false;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        res = await synthesize(apiKey, profile, config, text, previousText, nextText);
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
        ? { code: "VOICE_CONNECTION_FAILED" as VoiceErrorCode, status: 502, reason: "PROVIDER_NETWORK" as VoiceProviderReason }
        : classifyProviderFailure(upstreamStatus, rawDetail);
      await recordVoiceEvent({
        userId: user.id,
        outcome: "failure",
        code: mapped.code,
        reason: mapped.reason,
        upstreamStatus,
        requestId,
        personaId,
        providerDetail: providerDetail(rawDetail),
      });
      return voiceError(mapped.code, mapped.status, requestId, mapped.reason);
    }

    console.info("[voice] audio stream started", { requestId, personaId });
    await recordVoiceEvent({ userId: user.id, outcome: "ok", requestId, personaId });

    return new Response(res.body, {
      headers: { ...corsHeaders, "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
    });
  } catch (e) {
    console.error("[voice] unhandled failure", e);
    return json({ code: "VOICE_UNAVAILABLE" }, 500);
  }
});
