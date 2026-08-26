/**
 * QA sandbox flags.
 *
 * The sandbox replaces third-party dependencies (job boards, AI, e-mail
 * delivery, OAuth providers, Paddle, camera/microphone hardware) with
 * deterministic local fixtures so complete user journeys can be exercised
 * without any external credentials.
 *
 * It is only ever available on a development or preview host — never on the
 * production domains — and every mode is off until it is explicitly switched
 * on from `/qa/sandbox`, so normal traffic is untouched.
 */
import { safeStorage } from "@/lib/safeStorage";

export type MediaMode = "off" | "granted" | "denied" | "no-device";

export interface SandboxFlags {
  /** Job search + recommendation + resume analysis fixtures. */
  jobs: boolean;
  /** Resume upload → ATS analysis fixture (streamed). */
  resume: boolean;
  /** Synthetic camera/microphone streams for the interview flow. */
  media: MediaMode;
  /** Capture outgoing/reset e-mails into the local inbox instead of sending. */
  email: boolean;
  /** Deterministic mocked Google/Apple/Microsoft OAuth round-trip. */
  oauth: boolean;
  /** Local entitlement/credit simulator in place of Paddle. */
  payments: boolean;
}

export const DEFAULT_FLAGS: SandboxFlags = {
  jobs: false,
  resume: false,
  media: "off",
  email: false,
  oauth: false,
  payments: false,
};

const KEY = "gradr.qa.sandbox.flags";
const PRODUCTION_HOSTS = new Set(["gradr.me", "www.gradr.me", "app.gradr.me"]);

/** True when the sandbox may be used at all on this host/build. */
export function isSandboxAvailable(): boolean {
  if (typeof window === "undefined") return false;
  if (PRODUCTION_HOSTS.has(window.location.hostname)) return false;
  return Boolean(import.meta.env.DEV) || import.meta.env.VITE_QA_SANDBOX === "true";
}

let cache: SandboxFlags | null = null;

export function sandboxFlags(): SandboxFlags {
  if (!isSandboxAvailable()) return DEFAULT_FLAGS;
  if (cache) return cache;
  try {
    const raw = safeStorage.get(KEY);
    cache = raw ? { ...DEFAULT_FLAGS, ...(JSON.parse(raw) as Partial<SandboxFlags>) } : DEFAULT_FLAGS;
  } catch {
    cache = DEFAULT_FLAGS;
  }
  return cache;
}

const listeners = new Set<(flags: SandboxFlags) => void>();

export function setSandboxFlags(next: Partial<SandboxFlags>): SandboxFlags {
  const merged = { ...sandboxFlags(), ...next };
  cache = merged;
  try {
    safeStorage.set(KEY, JSON.stringify(merged));
  } catch {
    /* storage is best-effort */
  }
  listeners.forEach((fn) => fn(merged));
  return merged;
}

export function onSandboxFlagsChange(fn: (flags: SandboxFlags) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** True when any sandbox mode is active — used for the persistent warning strip. */
export function isSandboxActive(): boolean {
  const f = sandboxFlags();
  return f.jobs || f.resume || f.email || f.oauth || f.payments || f.media !== "off";
}
