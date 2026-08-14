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
    message: "The interviewer voice is offline while we sort it out. Your interview and transcript are safe — carry on by typing.",
    retryable: false,
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
