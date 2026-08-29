import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkRateLimit as durableRateLimit } from "../_shared/rateLimit.ts";
import { planTier, resolveEnv } from "../_shared/entitlements.ts";
import {
  classifyProviderFailure,
  corsHeaders,
  deepgramVoiceFor,
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
 * Interviewer speech.
 *
 *   Deepgram Aura-2 (primary)
 *     -> ElevenLabs / Fish Audio (server-side secondaries, only if configured)
 *       -> sanitized error, and the browser speaks the same sentence through
 *          the Web Speech API so the interview never goes silent.
 *
 * Voices one spoken thought at a time so the client can start playback while
 * the reasoning model (Gemini, in interview-coach) is still generating the rest
 * of the turn. The persona -> voice mapping is resolved here, server-side, so a
 * client can never point the interviewer at an arbitrary voice.
 *
 * No provider credential ever leaves this function. The client receives a Gradr
 * error code plus a safe enumerated provider reason.
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

/** Primary provider: Deepgram Aura-2, streamed as MP3. */
async function synthesizeDeepgram(
  apiKey: string,
  voice: string,
  text: string,
): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    return await fetch(
      `https://api.deepgram.com/v1/speak?model=${encodeURIComponent(voice)}&encoding=mp3`,
      {
        method: "POST",
        signal: controller.signal,
        headers: { Authorization: `Token ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      },
    );
  } catch (e) {
    console.error("[voice] deepgram request threw", String(e));
    return null;
  } finally {
    clearTimeout(timer);
  }
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

    const audioHeaders = (provider: string) => ({
      ...corsHeaders,
      "Content-Type": "audio/mpeg",
      "Cache-Control": "no-store",
      "X-Voice-Provider": provider,
      "Access-Control-Expose-Headers": "X-Voice-Provider",
    });

    // ---- Primary: Deepgram Aura-2 -----------------------------------------
    const deepgramKey = Deno.env.get("DEEPGRAM_API_KEY");
    let deepgramStatus = 0;
    let deepgramDetail = "";
    if (deepgramKey) {
      const voice = deepgramVoiceFor(personaId, config);
      // One retry only: a transient 429/5xx shouldn't drop a thought, and more
      // than one retry would delay speech more than the fallback would.
      let dg: Response | null = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        dg = await synthesizeDeepgram(deepgramKey, voice, text);
        if (dg && dg.ok) break;
        if (dg && dg.status < 500 && dg.status !== 429) break;
        if (attempt === 0) await new Promise((r) => setTimeout(r, 300));
      }
      if (dg?.ok && dg.body) {
        console.info("[voice] deepgram audio stream started", { requestId, personaId, voice });
        await recordVoiceEvent({
          userId: user.id,
          outcome: "ok",
          requestId,
          personaId,
          providerDetail: `deepgram:${voice}`,
        });
        return new Response(dg.body, { headers: audioHeaders("deepgram") });
      }
      deepgramStatus = dg?.status ?? 0;
      deepgramDetail = dg ? await dg.text().catch(() => "") : "no response body";
      console.error("[voice] deepgram failure", {
        requestId,
        personaId,
        voice,
        upstreamStatus: deepgramStatus,
        providerDetail: providerDetail(deepgramDetail),
      });
    } else {
      console.warn("[voice] DEEPGRAM_API_KEY not configured — using secondary providers", { requestId });
    }

    // ---- Secondary: ElevenLabs (only when configured) ----------------------
    const apiKey = Deno.env.get("ELEVENLABS_API_KEY");
    let res: Response | null = null;
    let networkError = false;
    if (apiKey) {
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
      if (res?.ok && res.body) {
        console.info("[voice] audio stream started via elevenlabs", { requestId, personaId });
        await recordVoiceEvent({
          userId: user.id,
          outcome: "ok",
          requestId,
          personaId,
          providerDetail: deepgramKey ? `elevenlabs (deepgram ${deepgramStatus})` : "elevenlabs",
        });
        return new Response(res.body, { headers: audioHeaders("elevenlabs") });
      }
    }

    // ---- Every server-side provider failed ---------------------------------
    const upstreamStatus = res?.status ?? deepgramStatus;
    const rawDetail = res
      ? await res.text().catch(() => "")
      : deepgramDetail || "no speech provider configured";
    // Server-side only: the full provider detail is diagnosable from logs and
    // is deliberately excluded from the response payload.
    console.error("[voice] all speech providers failed", {
      requestId,
      userId: user.id,
      personaId,
      upstreamStatus,
      providerDetail: providerDetail(rawDetail),
    });
    const mapped = !deepgramKey && !apiKey
      ? {
        code: "VOICE_CONFIGURATION_ERROR" as VoiceErrorCode,
        status: 503,
        reason: "PROVIDER_CREDENTIAL_MISSING" as VoiceProviderReason,
      }
      : networkError && !res && !deepgramStatus
      ? {
        code: "VOICE_CONNECTION_FAILED" as VoiceErrorCode,
        status: 502,
        reason: "PROVIDER_NETWORK" as VoiceProviderReason,
      }
      : classifyProviderFailure(upstreamStatus, rawDetail);

    // Last server-side resort before the browser's own voice takes over.
    const fallback = await synthesizeFallback(text, profile);
    if (fallback?.ok && fallback.body) {
      console.warn("[voice] served via fish audio", { requestId, upstreamStatus });
      await recordVoiceEvent({
        userId: user.id,
        outcome: "ok",
        requestId,
        personaId,
        providerDetail: `fallback:fish-audio (primary ${upstreamStatus})`,
      });
      return new Response(fallback.body, { headers: audioHeaders("fish-audio") });
    }
    if (fallback && !fallback.ok) {
      console.error("[voice] fallback provider failure", {
        requestId,
        status: fallback.status,
        detail: providerDetail(await fallback.text().catch(() => "")),
      });
    }

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
    // The browser now speaks this sentence through the Web Speech API.
    return voiceError(mapped.code, mapped.status, requestId, mapped.reason);
  } catch (e) {
    console.error("[voice] unhandled failure", e);
    return json({ code: "VOICE_UNAVAILABLE" }, 500);
  }
});
