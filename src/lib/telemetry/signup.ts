/**
 * Signup funnel instrumentation.
 *
 * OAuth signup finishes after a full-page redirect, so intent has to survive
 * the round trip. We stash only the chosen method (never credentials) in
 * sessionStorage and complete the funnel once Supabase reports a session.
 *
 * Every completion event is de-duplicated per account id, so a refresh, a tab
 * restore or React re-mounting the auth listener can never inflate the
 * `signup_completed` count that the whole funnel is measured against.
 */
import type { User } from "@supabase/supabase-js";
import { safeStorage } from "@/lib/safeStorage";
import { track, setAnalyticsPerson } from "./events";
import { readAttribution } from "./attribution";

export type SignupMethod = "email" | "google" | "apple" | "microsoft" | "guest";

const INTENT_KEY = "gradr_signup_intent";
const DONE_KEY = "gradr_signup_tracked";

interface Intent {
  method: SignupMethod;
  startedAt: string;
}

/** Called the moment the user commits to creating an account. */
export function markSignupIntent(method: SignupMethod) {
  const intent: Intent = { method, startedAt: new Date().toISOString() };
  safeStorage.set(INTENT_KEY, JSON.stringify(intent));
  track("signup_started", { signup_method: method });
}

function readIntent(): Intent | null {
  const raw = safeStorage.get(INTENT_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Intent;
  } catch {
    return null;
  }
}

function clearIntent() {
  safeStorage.remove(INTENT_KEY);
}

function alreadyTracked(userId: string): boolean {
  return safeStorage.get(DONE_KEY) === userId;
}

/** Derives the method from the provider Supabase actually authenticated with. */
function methodFromUser(user: User): SignupMethod {
  const provider = (user.app_metadata?.provider as string | undefined) ?? "email";
  if (provider === "google") return "google";
  if (provider === "apple") return "apple";
  if (provider === "azure" || provider === "microsoft") return "microsoft";
  if (user.is_anonymous) return "guest";
  return "email";
}

/** A session that belongs to an account created in the last few minutes. */
function isFreshAccount(user: User): boolean {
  if (!user.created_at) return false;
  return Date.now() - Date.parse(user.created_at) < 10 * 60 * 1000;
}

/**
 * Completes the signup funnel for a freshly authenticated session.
 * Returns true when signup events were emitted (i.e. this really was a new
 * account) so callers can branch without re-implementing the heuristics.
 */
export function completeSignupTracking(user: User): boolean {
  if (user.is_anonymous) return false;
  if (alreadyTracked(user.id)) return false;

  const intent = readIntent();
  const method = intent?.method && intent.method !== "guest" ? intent.method : methodFromUser(user);
  const isNew = Boolean(intent) || isFreshAccount(user);

  safeStorage.set(DONE_KEY, user.id);
  clearIntent();

  const attribution = readAttribution();
  const props = {
    signup_method: method,
    acquisition_source: attribution?.acquisition_source,
    referral_source: attribution?.referrer_domain,
    utm_source: attribution?.utm_source,
    utm_campaign: attribution?.utm_campaign,
    // First-touch entry path, so completions can be attributed back to the
    // landing page that produced them (e.g. /ai-career-coach).
    landing_page: attribution?.landing_page,
  };


  if (!isNew) {
    track("login_completed", { signup_method: method });
    return false;
  }

  // Ordered so the funnel reads created → completed for the same person.
  track("account_created", props);
  track("signup_completed", props);
  if (method === "google") track("signup_google_completed", props);
  if (method === "email") track("signup_email_completed", props);

  setAnalyticsPerson(
    {
      signup_method: method,
      acquisition_source: attribution?.acquisition_source,
      utm_source: attribution?.utm_source,
      utm_campaign: attribution?.utm_campaign,
      signed_up_at: new Date().toISOString().slice(0, 10),
    },
    true,
  );
  return true;
}

/** Sign-out: forget the dedupe marker so the next account tracks correctly. */
export function resetSignupTracking() {
  safeStorage.remove(DONE_KEY);
  clearIntent();
}
