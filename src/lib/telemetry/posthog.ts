/**
 * PostHog product analytics — single integration point for the whole app.
 *
 * Rules enforced here:
 *  - Safe no-op until the PostHog connector is linked
 *    (VITE_LOVABLE_CONNECTOR_POSTHOG_API_KEY). Only the public project token
 *    ever reaches the browser; personal API keys are never used client-side.
 *  - Nothing is sent before the visitor grants the "analytics" cookie
 *    category. Events fired before that decision are buffered in memory and
 *    flushed only if consent is granted in the same page view, so the first
 *    homepage view of a consenting visitor is not lost.
 *  - Identity is the Gradr (Supabase) user id — never the email address.
 */
import posthog from "posthog-js";
import { consentFor } from "@/lib/cookieConsent";

const TOKEN = import.meta.env.VITE_LOVABLE_CONNECTOR_POSTHOG_API_KEY as string | undefined;
const REGION = (import.meta.env.VITE_LOVABLE_CONNECTOR_POSTHOG_REGION as string) || "eu";
const API_HOST = REGION === "us" ? "https://us.i.posthog.com" : "https://eu.i.posthog.com";

const BUFFER_LIMIT = 30;

let started = false;
let optedIn = false;
let buffer: { event: string; props?: Record<string, unknown> }[] = [];
/** Identity requested before consent, replayed on opt-in so the person is not split. */
let pendingIdentity: { id: string; props?: Record<string, unknown> } | null = null;

export function initPostHog() {
  if (started || !TOKEN || typeof window === "undefined") return;
  started = true;

  posthog.init(TOKEN, {
    api_host: API_HOST,
    person_profiles: "identified_only",
    // Pageviews and funnel events are captured explicitly so the names stay
    // stable and every event carries the same base properties.
    capture_pageview: false,
    capture_pageleave: true,
    autocapture: false,
    mask_all_text: true,
    disable_session_recording: true,
    opt_out_capturing_by_default: true,
    // Deduplicate the SPA's rapid successive captures rather than dropping them.
    request_batching: true,
  });

  applyConsent();
  window.addEventListener("gradr:consent", applyConsent);
}

function applyConsent() {
  if (!started) return;
  const allowed = consentFor("analytics");
  if (allowed && !optedIn) {
    optedIn = true;
    posthog.opt_in_capturing();
    if (pendingIdentity) {
      posthog.identify(pendingIdentity.id, pendingIdentity.props);
      pendingIdentity = null;
    }
    const queued = buffer;
    buffer = [];
    for (const item of queued) posthog.capture(item.event, item.props);
  } else if (!allowed && optedIn) {
    optedIn = false;
    buffer = [];
    posthog.opt_out_capturing();
  }
}

/** True when PostHog is initialised (regardless of the consent decision). */
export function posthogEnabled() {
  return started;
}

/** True when events are actually being sent right now. */
export function posthogCapturing() {
  return started && optedIn;
}

export function phIdentify(userId: string, props?: Record<string, unknown>) {
  if (!started) return;
  if (!optedIn) {
    pendingIdentity = { id: userId, props };
    return;
  }
  // posthog-js links the anonymous distinct_id to this person automatically,
  // so the pre-signup journey stays attached to the account.
  posthog.identify(userId, props);
}

/** Person properties that should not overwrite a value already set. */
export function phSetPersonOnce(props: Record<string, unknown>) {
  if (!posthogCapturing()) return;
  posthog.setPersonProperties(undefined, props);
}

export function phSetPerson(props: Record<string, unknown>) {
  if (!posthogCapturing()) return;
  posthog.setPersonProperties(props);
}

/** Properties attached to every subsequent event (device, app surface, plan). */
export function phRegister(props: Record<string, unknown>) {
  if (!started) return;
  posthog.register(props);
}

export function phReset() {
  if (!started) return;
  pendingIdentity = null;
  posthog.reset();
}

export function phCapture(event: string, props?: Record<string, unknown>) {
  if (!started) return;
  if (!optedIn) {
    if (buffer.length < BUFFER_LIMIT) buffer.push({ event, props });
    return;
  }
  posthog.capture(event, props);
}

export function phPageview(path: string) {
  phCapture("$pageview", { $current_url: path, path });
}

/** Test seam — resets module state between unit tests. */
export function __resetPostHogForTests() {
  started = false;
  optedIn = false;
  buffer = [];
  pendingIdentity = null;
}
