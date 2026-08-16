import { supabase } from "@/integrations/supabase/client";
import { SUPABASE_FUNCTIONS_BASE } from "@/lib/supabaseEndpoints";
import { getPaddleEnvironment } from "@/lib/paddle";
import { toVoiceErrorCode, toVoiceProviderReason, type VoiceErrorCode, type VoiceProviderReason } from "./voiceErrors";

/**
 * Voice provider health as the candidate-facing widget sees it: configuration,
 * entitlement and the exact last failure — no log-diving required.
 */

export interface VoiceHealth {
  configured: boolean;
  entitled: boolean;
  tier: string;
  healthy: boolean;
  lastFailure: {
    code: VoiceErrorCode;
    reason: VoiceProviderReason | null;
    upstreamStatus: number | null;
    at: string;
  } | null;
  lastSuccessAt: string | null;
}

export async function fetchVoiceHealth(): Promise<VoiceHealth | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return null;

  const res = await fetch(`${SUPABASE_FUNCTIONS_BASE}/voice-status`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    },
    body: JSON.stringify({ environment: getPaddleEnvironment() }),
  });
  if (!res.ok) return null;

  const payload = await res.json().catch(() => null);
  if (!payload) return null;

  return {
    configured: Boolean(payload.configured),
    entitled: Boolean(payload.entitled),
    tier: String(payload.tier ?? "free"),
    healthy: Boolean(payload.healthy),
    lastFailure: payload.lastFailure
      ? {
        code: toVoiceErrorCode(payload.lastFailure.code),
        reason: toVoiceProviderReason(payload.lastFailure.reason),
        upstreamStatus: payload.lastFailure.upstreamStatus ?? null,
        at: String(payload.lastFailure.at),
      }
      : null,
    lastSuccessAt: payload.lastSuccessAt ?? null,
  };
}

/**
 * Re-establishes the app session before a voice retry.
 *
 * "Reconnect" never swaps provider — it refreshes the Supabase session so a
 * stale token can't be mistaken for a provider outage, then re-reads health.
 */
export async function reconnectVoiceSession(): Promise<VoiceHealth | null> {
  await supabase.auth.refreshSession().catch(() => null);
  return fetchVoiceHealth();
}
