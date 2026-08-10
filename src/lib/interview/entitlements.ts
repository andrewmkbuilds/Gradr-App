/**
 * Plan entitlements for the realtime (Gemini Live) mock interview.
 *
 * Mirrored server-side in the `interview-realtime-token` edge function — the
 * client copy exists only to render accurate gating UI. Never trust it for access.
 */

export type PlanTier = "free" | "starter" | "pro";

export interface RealtimeEntitlement {
  tier: PlanTier;
  label: string;
  /** Whether the low-latency Gemini Live voice engine is available at all. */
  realtimeVoice: boolean;
  /** Realtime sessions allowed per calendar month. null = unlimited. */
  sessionsPerMonth: number | null;
  /** Hard cap on a single realtime session. */
  maxSessionMinutes: number;
  /** Interviewer personas the tier may use. null = all. */
  personas: string[] | null;
  /** Difficulty tiers the plan may use. null = all. */
  difficulties: string[] | null;
  /** Fish Audio premium voice fallback when Gemini Live is unavailable. */
  premiumVoiceFallback: boolean;
}

export const REALTIME_ENTITLEMENTS: Record<PlanTier, RealtimeEntitlement> = {
  free: {
    tier: "free",
    label: "Free",
    realtimeVoice: false,
    sessionsPerMonth: 2,
    maxSessionMinutes: 10,
    personas: ["friendly", "hiring-manager"],
    difficulties: ["warmup", "standard"],
    premiumVoiceFallback: false,
  },
  starter: {
    tier: "starter",
    label: "Starter",
    realtimeVoice: true,
    sessionsPerMonth: 8,
    maxSessionMinutes: 20,
    personas: ["friendly", "hiring-manager", "technical"],
    difficulties: ["warmup", "standard", "senior"],
    premiumVoiceFallback: true,
  },
  pro: {
    tier: "pro",
    label: "Pro",
    realtimeVoice: true,
    sessionsPerMonth: null,
    maxSessionMinutes: 45,
    personas: null,
    difficulties: null,
    premiumVoiceFallback: true,
  },
};

export function entitlementFor(tier: string | null | undefined): RealtimeEntitlement {
  const key = (tier ?? "free").toLowerCase();
  if (key === "pro") return REALTIME_ENTITLEMENTS.pro;
  if (key === "starter") return REALTIME_ENTITLEMENTS.starter;
  return REALTIME_ENTITLEMENTS.free;
}

export function personaAllowed(ent: RealtimeEntitlement, personaId: string) {
  return ent.personas === null || ent.personas.includes(personaId);
}

export function difficultyAllowed(ent: RealtimeEntitlement, difficultyId: string) {
  return ent.difficulties === null || ent.difficulties.includes(difficultyId);
}

/** Human copy for the upgrade nudge shown when a tier limit blocks the action. */
export function upgradeReason(ent: RealtimeEntitlement, kind: "voice" | "quota" | "persona" | "difficulty") {
  switch (kind) {
    case "voice":
      return "Realtime voice interviews are available on Starter and Pro. On Free you can still run the full interview with browser voice.";
    case "quota":
      return `You've used all ${ent.sessionsPerMonth} realtime sessions included this month on ${ent.label}. Upgrade for more.`;
    case "persona":
      return "This interviewer persona is unlocked on a higher plan.";
    case "difficulty":
      return "This difficulty level is unlocked on a higher plan.";
  }
}
