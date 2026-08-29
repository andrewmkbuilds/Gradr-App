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
  };
  try {
    const { data } = await serviceClient()
      .from("voice_provider_config")
      .select("model_id, output_format, voice_overrides")
      .eq("id", true)
      .maybeSingle();
    if (!data) return fallback;
    return {
      modelId: data.model_id || fallback.modelId,
      outputFormat: data.output_format || fallback.outputFormat,
      voiceOverrides: (data.voice_overrides ?? {}) as Record<string, string>,
    };
  } catch (e) {
    console.error("[voice] config load failed", String(e));
    return fallback;
  }
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
