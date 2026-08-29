/**
 * Shared interviewer-voice provider helpers.
 *
 * Owns three things the voice surfaces all need:
 *  - the persona -> voice mapping (plus admin overrides stored in the database)
 *  - classification of provider failures into Gradr codes + a *safe enumerated*
 *    provider reason (never raw provider prose, never the credential)
 *  - recording of voice outcomes so the interview health widget and the admin
 *    console can show the exact last failure without reading server logs.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

export interface VoiceProfile {
  voiceId: string;
  stability: number;
  similarityBoost: number;
  style: number;
  speed: number;
  /** Optional Fish Audio reference id used when the primary provider fails. */
  fallbackVoiceId?: string;
}

/** Mirrored in src/lib/interview/voiceProfiles.ts (UI labels only). */
export const VOICE_PROFILES: Record<string, VoiceProfile> = {
  friendly: { voiceId: "EXAVITQu4vr4xnSDxMaL", stability: 0.42, similarityBoost: 0.78, style: 0.28, speed: 1.02 },
  "hiring-manager": { voiceId: "nPczCjzI2devNBz1zQrb", stability: 0.5, similarityBoost: 0.75, style: 0.18, speed: 0.99 },
  technical: { voiceId: "cjVigY5qzO86Huf0OWal", stability: 0.58, similarityBoost: 0.72, style: 0.12, speed: 0.97 },
  executive: { voiceId: "JBFqnCBsd6RMkjVDRZzb", stability: 0.62, similarityBoost: 0.7, style: 0.1, speed: 0.94 },
  stress: { voiceId: "iP95p4xoKVk53GoZ742B", stability: 0.38, similarityBoost: 0.8, style: 0.22, speed: 1.09 },
};

/**
 * Deepgram Aura-2 voice per persona — the PRIMARY interviewer voice.
 *
 * Chosen for conversational realism rather than broadcast polish: every one of
 * these is a calm, professional register. No announcer voices, nothing
 * over-enthusiastic. The persona changes who is in the room, not how theatrical
 * the delivery is.
 */
export const DEEPGRAM_VOICES: Record<string, string> = {
  friendly: "aura-2-cora-en", // warm, approachable screening voice
  "hiring-manager": "aura-2-arcas-en", // grounded, natural, measured
  technical: "aura-2-apollo-en", // precise, unhurried, matter-of-fact
  executive: "aura-2-orion-en", // deliberate, senior, low energy
  stress: "aura-2-draco-en", // direct and clipped, never shouty
};

export const DEFAULT_DEEPGRAM_VOICE = "aura-2-arcas-en";

export function deepgramVoiceFor(personaId: string, config?: VoiceConfig): string {
  const override = config?.deepgramOverrides?.[personaId];
  if (override) return override;
  return DEEPGRAM_VOICES[personaId] ?? DEFAULT_DEEPGRAM_VOICE;
}

export const DEFAULT_MODEL_ID = "eleven_turbo_v2_5";
export const DEFAULT_OUTPUT_FORMAT = "mp3_44100_128";

export type VoiceErrorCode =
  | "VOICE_UNAVAILABLE"
  | "VOICE_CONNECTION_FAILED"
  | "VOICE_RATE_LIMITED"
  | "VOICE_CONFIGURATION_ERROR"
  | "VOICE_TIMEOUT"
  | "VOICE_NOT_ENTITLED"
  | "VOICE_SESSION_EXPIRED";

/**
 * Enumerated, safe-to-display provider reasons. Mirrored in
 * src/lib/interview/voiceErrors.ts. Derived from the provider payload but never
 * containing provider prose, ids or credentials.
 */
export type VoiceProviderReason =
  | "PROVIDER_CREDENTIAL_MISSING"
  | "PROVIDER_INVALID_KEY"
  | "PROVIDER_UNUSUAL_ACTIVITY"
  | "PROVIDER_QUOTA_EXCEEDED"
  | "PROVIDER_CONCURRENCY_LIMIT"
  | "PROVIDER_VOICE_NOT_FOUND"
  | "PROVIDER_MODEL_UNAVAILABLE"
  | "PROVIDER_TIMEOUT"
  | "PROVIDER_NETWORK"
  | "PROVIDER_SERVER_ERROR"
  | "PROVIDER_UNKNOWN";

/** Extracts the provider's machine status slug without leaking its prose. */
function providerStatusSlug(raw: string): string {
  try {
    const parsed = JSON.parse(raw);
    const detail = parsed?.detail ?? parsed;
    const status = detail?.status ?? parsed?.status;
    if (typeof status === "string") return status.toLowerCase();
    const message = typeof detail?.message === "string" ? detail.message : typeof detail === "string" ? detail : "";
    return message.toLowerCase();
  } catch {
    return raw.toLowerCase();
  }
}

export function classifyProviderReason(status: number, rawBody: string): VoiceProviderReason {
  const slug = providerStatusSlug(rawBody ?? "");
  if (slug.includes("detected_unusual_activity") || slug.includes("unusual activity")) {
    return "PROVIDER_UNUSUAL_ACTIVITY";
  }
  if (slug.includes("quota_exceeded") || slug.includes("credits") || slug.includes("insufficient")) {
    return "PROVIDER_QUOTA_EXCEEDED";
  }
  if (slug.includes("too_many_concurrent") || slug.includes("concurrent")) return "PROVIDER_CONCURRENCY_LIMIT";
  if (slug.includes("invalid_api_key") || slug.includes("missing_permissions") || slug.includes("api_key")) {
    return "PROVIDER_INVALID_KEY";
  }
  if (slug.includes("voice_not_found") || slug.includes("voice_does_not_exist")) return "PROVIDER_VOICE_NOT_FOUND";
  if (slug.includes("model_not_found") || slug.includes("model")) return "PROVIDER_MODEL_UNAVAILABLE";
  if (status === 401 || status === 403) return "PROVIDER_INVALID_KEY";
  if (status === 429) return "PROVIDER_QUOTA_EXCEEDED";
  if (status === 408 || status === 504) return "PROVIDER_TIMEOUT";
  if (status >= 500) return "PROVIDER_SERVER_ERROR";
  if (status === 0) return "PROVIDER_NETWORK";
  return "PROVIDER_UNKNOWN";
}

export function classifyProviderFailure(
  status: number,
  rawBody: string,
): { code: VoiceErrorCode; status: number; reason: VoiceProviderReason } {
  const reason = classifyProviderReason(status, rawBody);
  if (reason === "PROVIDER_UNUSUAL_ACTIVITY") return { code: "VOICE_CONFIGURATION_ERROR", status: 503, reason };
  if (reason === "PROVIDER_QUOTA_EXCEEDED" || reason === "PROVIDER_CONCURRENCY_LIMIT") {
    return { code: "VOICE_RATE_LIMITED", status: 429, reason };
  }
  if (reason === "PROVIDER_INVALID_KEY" || reason === "PROVIDER_VOICE_NOT_FOUND" || reason === "PROVIDER_MODEL_UNAVAILABLE") {
    return { code: "VOICE_CONFIGURATION_ERROR", status: 503, reason };
  }
  if (reason === "PROVIDER_TIMEOUT") return { code: "VOICE_TIMEOUT", status: 504, reason };
  if (reason === "PROVIDER_NETWORK") return { code: "VOICE_CONNECTION_FAILED", status: 502, reason };
  if (reason === "PROVIDER_SERVER_ERROR") return { code: "VOICE_UNAVAILABLE", status: 503, reason };
  return { code: "VOICE_CONNECTION_FAILED", status: 502, reason };
}

/** Truncated provider detail — for server logs only, never for responses. */
export function providerDetail(raw: string) {
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

export function serviceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

export interface VoiceConfig {
  modelId: string;
  outputFormat: string;
  voiceOverrides: Record<string, string>;
  /** Optional per-persona Deepgram voice overrides (admin-configurable). */
  deepgramOverrides?: Record<string, string>;
}

export async function loadVoiceConfig(): Promise<VoiceConfig> {
  const fallback: VoiceConfig = {
    modelId: DEFAULT_MODEL_ID,
    outputFormat: DEFAULT_OUTPUT_FORMAT,
    voiceOverrides: {},
    deepgramOverrides: {},
  };
  try {
    const { data } = await serviceClient()
      .from("voice_provider_config")
      .select("model_id, output_format, voice_overrides, deepgram_overrides")
      .eq("id", true)
      .maybeSingle();
    if (!data) return fallback;
    return {
      modelId: data.model_id || fallback.modelId,
      outputFormat: data.output_format || fallback.outputFormat,
      voiceOverrides: (data.voice_overrides ?? {}) as Record<string, string>,
      deepgramOverrides: (data.deepgram_overrides ?? {}) as Record<string, string>,
    };
  } catch (e) {
    console.error("[voice] config load failed", String(e));
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// Spoken-audio cache
//
// Interviewers repeat themselves: greetings, hand-overs, closing lines and the
// same probing questions across sessions. Caching the synthesised audio by the
// exact spoken text (plus the voice that spoke it) removes a full provider
// round-trip from those turns. The key includes every input that changes the
// waveform, so a persona/voice/model change can never serve the wrong voice.
// ---------------------------------------------------------------------------

export const VOICE_CACHE_BUCKET = "voice-cache";

export async function voiceCacheKey(parts: {
  provider: string;
  voiceId: string;
  modelId: string;
  outputFormat: string;
  text: string;
}): Promise<string> {
  const payload = [parts.provider, parts.voiceId, parts.modelId, parts.outputFormat, parts.text].join("\u0000");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Returns cached audio bytes for this exact spoken thought, or null. */
export async function readVoiceCache(cacheKey: string): Promise<Uint8Array | null> {
  try {
    const client = serviceClient();
    const { data: row } = await client
      .from("voice_audio_cache")
      .select("storage_path")
      .eq("cache_key", cacheKey)
      .maybeSingle();
    if (!row?.storage_path) return null;

    const { data: file, error } = await client.storage.from(VOICE_CACHE_BUCKET).download(row.storage_path);
    if (error || !file) return null;
    // Best-effort usage accounting; never blocks the turn.
    void client.rpc("touch_voice_audio_cache", { _cache_key: cacheKey });
    return new Uint8Array(await file.arrayBuffer());
  } catch (e) {
    console.error("[voice] cache read failed", String(e));
    return null;
  }
}

/**
 * Stores audio for reuse. Upsert on the cache key so two turns racing on the
 * same sentence converge on one row instead of duplicating the clip.
 */
export async function writeVoiceCache(args: {
  cacheKey: string;
  personaId: string;
  voiceId: string;
  provider: string;
  bytes: Uint8Array;
}): Promise<void> {
  try {
    if (!args.bytes.byteLength || args.bytes.byteLength > 4_000_000) return;
    const client = serviceClient();
    const storagePath = `${args.provider}/${args.cacheKey}.mp3`;
    const { error: uploadError } = await client.storage
      .from(VOICE_CACHE_BUCKET)
      .upload(storagePath, args.bytes, { contentType: "audio/mpeg", upsert: true });
    if (uploadError) {
      console.error("[voice] cache upload failed", uploadError.message);
      return;
    }
    await client.from("voice_audio_cache").upsert({
      cache_key: args.cacheKey,
      persona_id: args.personaId,
      voice_id: args.voiceId,
      provider: args.provider,
      storage_path: storagePath,
      byte_size: args.bytes.byteLength,
      last_used_at: new Date().toISOString(),
    }, { onConflict: "cache_key" });
  } catch (e) {
    console.error("[voice] cache write failed", String(e));
  }
}

/** Runs background work after the response is returned, when supported. */
export function afterResponse(task: Promise<unknown>) {
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
  if (runtime?.waitUntil) runtime.waitUntil(task);
  else void task;
}

export function resolveProfile(personaId: string, config: VoiceConfig): VoiceProfile {
  const base = VOICE_PROFILES[personaId] ?? VOICE_PROFILES["hiring-manager"];
  const override = config.voiceOverrides?.[personaId];
  return override ? { ...base, voiceId: override } : base;
}

export interface VoiceEvent {
  userId: string | null;
  outcome: "ok" | "failure";
  code?: VoiceErrorCode | null;
  reason?: VoiceProviderReason | null;
  upstreamStatus?: number | null;
  requestId?: string | null;
  context?: string;
  /** Interviewer persona in play — admin diagnostics only. */
  personaId?: string | null;
  /**
   * Truncated provider detail. Server-side only: it is stored for admin
   * diagnostics and never returned on any candidate-facing response.
   */
  providerDetail?: string | null;
  /** Which engine actually spoke: deepgram | elevenlabs | fish-audio | cache. */
  provider?: string | null;
  /** Wall-clock ms from request start to usable audio. */
  latencyMs?: number | null;
  /** True when the audio came from the spoken-audio cache. */
  cacheHit?: boolean;
}

/** Best-effort: recording health must never break a live interview turn. */
export async function recordVoiceEvent(ev: VoiceEvent) {
  try {
    await serviceClient().from("voice_provider_events").insert({
      user_id: ev.userId,
      outcome: ev.outcome,
      code: ev.code ?? null,
      provider_reason: ev.reason ?? null,
      upstream_status: ev.upstreamStatus ?? null,
      request_id: ev.requestId ?? null,
      persona_id: ev.personaId ?? null,
      provider_detail: ev.providerDetail ? ev.providerDetail.slice(0, 300) : null,
      provider: ev.provider ?? null,
      latency_ms: ev.latencyMs ?? null,
      cache_hit: ev.cacheHit ?? false,
      context: ev.context ?? "interview",
    });
  } catch (e) {
    console.error("[voice] event record failed", String(e));
  }
}

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
