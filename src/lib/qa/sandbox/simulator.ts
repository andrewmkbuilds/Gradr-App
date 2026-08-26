/**
 * Local payment / entitlement simulator.
 *
 * Stands in for Paddle so the paywall, upgrades, downgrades, cancellations and
 * credit packs can be exercised without provider credentials. State lives in
 * local storage only — nothing is written to the database, so a simulated plan
 * can never leak into real billing records.
 *
 * Credit packs are keyed by a purchase id and applied at most once, which is
 * the behaviour the real webhook guarantees and the thing QA needs to verify.
 */
import { safeStorage } from "@/lib/safeStorage";

export type SimPlan = "free" | "starter" | "pro" | "advanced";
export type SimInterval = "monthly" | "annual";

export interface SimPurchase {
  id: string;
  pack_label: string;
  pack_key: string;
  credits_granted: number;
  amount_total: number;
  currency: string;
  status: string;
  created_at: string;
}

export interface SimulatorState {
  plan: SimPlan;
  status: "active" | "canceled" | "past_due";
  interval: SimInterval;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  applicationCredits: number;
  interviewCredits: number;
  purchases: SimPurchase[];
  /** Purchase ids already applied — guards against double-granting. */
  appliedPurchaseIds: string[];
}

const KEY = "gradr.qa.sandbox.billing";

function periodEnd(interval: SimInterval): string {
  const d = new Date();
  d.setMonth(d.getMonth() + (interval === "annual" ? 12 : 1));
  return d.toISOString();
}

export const INITIAL_STATE: SimulatorState = {
  plan: "free",
  status: "active",
  interval: "monthly",
  currentPeriodEnd: periodEnd("monthly"),
  cancelAtPeriodEnd: false,
  applicationCredits: 0,
  interviewCredits: 0,
  purchases: [],
  appliedPurchaseIds: [],
};

const listeners = new Set<(state: SimulatorState) => void>();

export function simulatorState(): SimulatorState {
  return { ...INITIAL_STATE, ...safeStorage.getJSON<Partial<SimulatorState>>(KEY, {}) };
}

function write(next: SimulatorState): SimulatorState {
  safeStorage.setJSON(KEY, next);
  listeners.forEach((fn) => fn(next));
  return next;
}

export function onSimulatorChange(fn: (state: SimulatorState) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function resetSimulator(): SimulatorState {
  return write({ ...INITIAL_STATE, currentPeriodEnd: periodEnd("monthly") });
}

/** Upgrade or downgrade. A downgrade to free keeps access until period end. */
export function setSimulatedPlan(plan: SimPlan, interval: SimInterval = "monthly"): SimulatorState {
  const current = simulatorState();
  return write({
    ...current,
    plan,
    interval,
    status: "active",
    cancelAtPeriodEnd: false,
    currentPeriodEnd: periodEnd(interval),
  });
}

/** Cancel at period end — the plan stays live until `currentPeriodEnd`. */
export function cancelSimulatedPlan(): SimulatorState {
  const current = simulatorState();
  return write({ ...current, status: "canceled", cancelAtPeriodEnd: true });
}

export function resumeSimulatedPlan(): SimulatorState {
  const current = simulatorState();
  return write({ ...current, status: "active", cancelAtPeriodEnd: false });
}

export const CREDIT_PACKS: Record<string, { label: string; feature: "application" | "interview"; credits: number; amount: number }> = {
  application_10: { label: "10 application credits", feature: "application", credits: 10, amount: 900 },
  interview_5: { label: "5 interview credits", feature: "interview", credits: 5, amount: 1900 },
};

/** Grants a pack once per purchase id; a repeat call is a no-op. */
export function applySimulatedPack(packKey: string, purchaseId?: string): SimulatorState {
  const pack = CREDIT_PACKS[packKey] ?? CREDIT_PACKS.interview_5;
  const id = purchaseId ?? `sim_${Date.now().toString(36)}`;
  const current = simulatorState();
  if (current.appliedPurchaseIds.includes(id)) return current;

  return write({
    ...current,
    applicationCredits: current.applicationCredits + (pack.feature === "application" ? pack.credits : 0),
    interviewCredits: current.interviewCredits + (pack.feature === "interview" ? pack.credits : 0),
    appliedPurchaseIds: [...current.appliedPurchaseIds, id],
    purchases: [
      {
        id,
        pack_label: pack.label,
        pack_key: packKey,
        credits_granted: pack.credits,
        amount_total: pack.amount,
        currency: "USD",
        status: "completed",
        created_at: new Date().toISOString(),
      },
      ...current.purchases,
    ].slice(0, 50),
  });
}

const ALLOWANCES: Record<SimPlan, { resume: number | null; application: number | null; interview: number | null }> = {
  free: { resume: 1, application: 1, interview: 0 },
  starter: { resume: 10, application: 10, interview: 2 },
  pro: { resume: null, application: 50, interview: 10 },
  advanced: { resume: null, application: null, interview: null },
};

/** Shape returned by the `entitlement_snapshot` RPC. */
export function simulatedEntitlementSnapshot() {
  const s = simulatorState();
  const live = s.status !== "canceled" || new Date(s.currentPeriodEnd) > new Date();
  const plan: SimPlan = live ? s.plan : "free";
  const a = ALLOWANCES[plan];
  const feature = (allowance: number | null, extra = 0) => ({
    allowance: allowance === null ? null : allowance + extra,
    used: 0,
    remaining: allowance === null ? null : allowance + extra,
  });
  return {
    tier: plan,
    features: {
      resume: feature(a.resume),
      application: feature(a.application, s.applicationCredits),
      interview: feature(a.interview, s.interviewCredits),
    },
  };
}

/** Shape of a `subscribers` row. */
export function simulatedSubscriberRow(userId: string, environment: string) {
  const s = simulatorState();
  return {
    user_id: userId,
    environment,
    subscribed: s.plan !== "free" && s.status === "active",
    subscription_tier: s.plan === "free" ? null : s.plan,
    subscription_status: s.plan === "free" ? null : s.status,
    billing_interval: s.plan === "free" ? null : s.interval,
    current_period_end: s.plan === "free" ? null : s.currentPeriodEnd,
    cancel_at_period_end: s.cancelAtPeriodEnd,
  };
}
