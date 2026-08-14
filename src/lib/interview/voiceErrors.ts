/**
 * Gradr-native voice error vocabulary.
 *
 * The interview UI only ever handles these codes. No provider name, provider
 * policy text or raw upstream message is allowed past the backend boundary —
 * the backend logs the detail and returns one of these codes instead. Swapping
 * the underlying speech provider therefore never touches the interview UI.
 */

export const VOICE_ERROR_CODES = [
  "VOICE_UNAVAILABLE",
  "VOICE_CONNECTION_FAILED",
  "VOICE_PERMISSION_DENIED",
  "VOICE_RATE_LIMITED",
  "VOICE_CONFIGURATION_ERROR",
  "VOICE_TIMEOUT",
  "VOICE_NOT_ENTITLED",
  "VOICE_SESSION_EXPIRED",
] as const;

export type VoiceErrorCode = (typeof VOICE_ERROR_CODES)[number];

/** Sentinel used internally when a turn is cancelled on purpose (barge-in). */
export const VOICE_ABORTED = "VOICE_ABORTED";

export function isVoiceErrorCode(value: unknown): value is VoiceErrorCode {
  return typeof value === "string" && (VOICE_ERROR_CODES as readonly string[]).includes(value);
}

export function toVoiceErrorCode(value: unknown): VoiceErrorCode {
  return isVoiceErrorCode(value) ? value : "VOICE_UNAVAILABLE";
}

interface VoiceErrorCopy {
  title: string;
  message: string;
  /** Retry is pointless for these — the studio only offers "Continue by typing". */
  retryable: boolean;
}

const DEFAULT_COPY: VoiceErrorCopy = {
  title: "Interviewer voice temporarily unavailable",
  message: "We couldn't connect to the interviewer voice right now. Your interview and transcript are safe.",
  retryable: true,
};

const COPY: Record<VoiceErrorCode, VoiceErrorCopy> = {
  VOICE_UNAVAILABLE: DEFAULT_COPY,
  VOICE_CONNECTION_FAILED: DEFAULT_COPY,
  VOICE_TIMEOUT: {
    title: "Interviewer voice temporarily unavailable",
    message: "The interviewer voice took too long to respond. Your interview and transcript are safe.",
    retryable: true,
  },
  VOICE_RATE_LIMITED: {
    title: "Interviewer voice temporarily unavailable",
    message: "The interviewer voice is catching its breath. Wait a moment and retry — your interview and transcript are safe.",
    retryable: true,
  },
  VOICE_PERMISSION_DENIED: {
    title: "Interviewer voice temporarily unavailable",
    message: "Your browser blocked interview audio playback. Allow sound for this tab and retry — your interview and transcript are safe.",
    retryable: true,
  },
  VOICE_CONFIGURATION_ERROR: {
    title: "Interviewer voice temporarily unavailable",
    message: "We couldn't connect to the interviewer voice right now. Your interview and transcript are safe — retry, or carry on by typing.",
    retryable: true,
  },
  VOICE_NOT_ENTITLED: {
    title: "Interviewer voice not included in your plan",
    message: "Spoken interviews are part of the paid plans. Your interview and transcript are safe — carry on by typing.",
    retryable: false,
  },
  VOICE_SESSION_EXPIRED: {
    title: "Interviewer voice temporarily unavailable",
    message: "Your session expired. Sign in again to bring the voice back — your interview and transcript are safe.",
    retryable: false,
  },
};

export function voiceErrorCopy(code: VoiceErrorCode | null | undefined): VoiceErrorCopy {
  return code ? COPY[code] ?? DEFAULT_COPY : DEFAULT_COPY;
}

/**
 * Enumerated provider reasons.
 *
 * The backend derives these from the speech provider's machine-readable status
 * (never its prose) so the studio can explain *precisely* what went wrong —
 * an entitlement/anti-abuse block reads very differently from a quota problem —
 * while still keeping provider payloads server-side.
 * Mirrored in supabase/functions/_shared/voiceProvider.ts.
 */
export const VOICE_PROVIDER_REASONS = [
  "PROVIDER_CREDENTIAL_MISSING",
  "PROVIDER_INVALID_KEY",
  "PROVIDER_UNUSUAL_ACTIVITY",
  "PROVIDER_QUOTA_EXCEEDED",
  "PROVIDER_CONCURRENCY_LIMIT",
  "PROVIDER_VOICE_NOT_FOUND",
  "PROVIDER_MODEL_UNAVAILABLE",
  "PROVIDER_TIMEOUT",
  "PROVIDER_NETWORK",
  "PROVIDER_SERVER_ERROR",
  "PROVIDER_UNKNOWN",
] as const;

export type VoiceProviderReason = (typeof VOICE_PROVIDER_REASONS)[number];

export function toVoiceProviderReason(value: unknown): VoiceProviderReason | null {
  return typeof value === "string" && (VOICE_PROVIDER_REASONS as readonly string[]).includes(value)
    ? (value as VoiceProviderReason)
    : null;
}

interface VoiceReasonCopy {
  label: string;
  detail: string;
  /** Whether reconnecting the session has a realistic chance of clearing it. */
  reconnectHelps: boolean;
}

const REASON_COPY: Record<VoiceProviderReason, VoiceReasonCopy> = {
  PROVIDER_CREDENTIAL_MISSING: {
    label: "Voice service not configured",
    detail: "Gradr's speech service has no credential configured right now. An admin needs to reconnect it.",
    reconnectHelps: false,
  },
  PROVIDER_INVALID_KEY: {
    label: "Voice service credential rejected",
    detail: "The speech service refused Gradr's credential. An admin needs to reconnect it — nothing on your side is wrong.",
    reconnectHelps: false,
  },
  PROVIDER_UNUSUAL_ACTIVITY: {
    label: "Voice entitlement temporarily suspended",
    detail:
      "The speech service flagged unusual activity on Gradr's account and paused streaming (detected_unusual_activity). This is an account-level entitlement block, not a fault in your interview. Reconnecting re-checks entitlement; if it persists, an admin has to clear it with the provider.",
    reconnectHelps: true,
  },
  PROVIDER_QUOTA_EXCEEDED: {
    label: "Voice quota exhausted",
    detail: "Gradr's speech quota for this period is used up. Reconnect to re-check, or carry on by typing.",
    reconnectHelps: true,
  },
  PROVIDER_CONCURRENCY_LIMIT: {
    label: "Too many voices at once",
    detail: "The speech service is at its concurrent-stream limit. Waiting a moment and reconnecting usually clears it.",
    reconnectHelps: true,
  },
  PROVIDER_VOICE_NOT_FOUND: {
    label: "Interviewer voice unavailable",
    detail: "The configured interviewer voice is no longer available on the speech account. An admin needs to pick another voice.",
    reconnectHelps: false,
  },
  PROVIDER_MODEL_UNAVAILABLE: {
    label: "Speech model unavailable",
    detail: "The configured speech model isn't available on Gradr's speech account right now.",
    reconnectHelps: false,
  },
  PROVIDER_TIMEOUT: {
    label: "Speech service timed out",
    detail: "The speech service didn't answer in time. Reconnecting normally recovers the turn.",
    reconnectHelps: true,
  },
  PROVIDER_NETWORK: {
    label: "Couldn't reach the speech service",
    detail: "Gradr couldn't reach the speech service. Check your connection and reconnect.",
    reconnectHelps: true,
  },
  PROVIDER_SERVER_ERROR: {
    label: "Speech service error",
    detail: "The speech service returned an error. Reconnecting usually recovers within a minute.",
    reconnectHelps: true,
  },
  PROVIDER_UNKNOWN: {
    label: "Unclassified speech failure",
    detail: "The speech service failed for an unrecognised reason. Reconnect to try the turn again.",
    reconnectHelps: true,
  },
};

export function voiceReasonCopy(reason: VoiceProviderReason | null | undefined): VoiceReasonCopy | null {
  return reason ? REASON_COPY[reason] ?? REASON_COPY.PROVIDER_UNKNOWN : null;
}
