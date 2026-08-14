/**
 * Interviewer voice profiles (ElevenLabs).
 *
 * Each persona maps to a distinct ElevenLabs voice plus delivery settings so
 * the personas genuinely *sound* different, not just read different words.
 * The mapping is mirrored server-side in the `interview-speech` edge function —
 * this copy exists for UI labelling only and is never trusted for the API call.
 */

import type { PersonaId } from "./personas";

export interface VoiceProfile {
  /** ElevenLabs voice id. */
  voiceId: string;
  /** Human label for the settings UI. */
  label: string;
  /** Lower = more expressive/variable, higher = more even. */
  stability: number;
  similarityBoost: number;
  /** Style exaggeration — keep low; interviewers are not performers. */
  style: number;
  /** Speech rate multiplier (0.7 – 1.2). */
  speed: number;
  /** Extra silence (ms) between spoken thoughts — sets the persona's rhythm. */
  beatMs: number;
  /** Pause (ms) before the interviewer starts a turn — the "thinking" beat. */
  leadInMs: number;
}

export const VOICE_PROFILES: Record<PersonaId, VoiceProfile> = {
  friendly: {
    voiceId: "EXAVITQu4vr4xnSDxMaL", // Sarah — warm, easy screening voice
    label: "Sarah",
    stability: 0.42,
    similarityBoost: 0.78,
    style: 0.28,
    speed: 1.02,
    beatMs: 220,
    leadInMs: 420,
  },
  "hiring-manager": {
    voiceId: "nPczCjzI2devNBz1zQrb", // Brian — grounded, measured
    label: "Brian",
    stability: 0.5,
    similarityBoost: 0.75,
    style: 0.18,
    speed: 0.99,
    beatMs: 300,
    leadInMs: 650,
  },
  technical: {
    voiceId: "cjVigY5qzO86Huf0OWal", // Eric — precise, unhurried
    label: "Eric",
    stability: 0.58,
    similarityBoost: 0.72,
    style: 0.12,
    speed: 0.97,
    beatMs: 360,
    leadInMs: 800,
  },
  executive: {
    voiceId: "JBFqnCBsd6RMkjVDRZzb", // George — deliberate, senior
    label: "George",
    stability: 0.62,
    similarityBoost: 0.7,
    style: 0.1,
    speed: 0.94,
    beatMs: 460,
    leadInMs: 950,
  },
  stress: {
    voiceId: "iP95p4xoKVk53GoZ742B", // Chris — brisk, direct
    label: "Chris",
    stability: 0.38,
    similarityBoost: 0.8,
    style: 0.22,
    speed: 1.09,
    beatMs: 130,
    leadInMs: 220,
  },
};

export function voiceProfileFor(personaId: string): VoiceProfile {
  return VOICE_PROFILES[personaId as PersonaId] ?? VOICE_PROFILES["hiring-manager"];
}
