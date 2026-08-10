/**
 * PostHog product analytics.
 * Safe no-op until the PostHog connector is linked
 * (VITE_LOVABLE_CONNECTOR_POSTHOG_API_KEY).
 */
import posthog from "posthog-js";

const TOKEN = import.meta.env.VITE_LOVABLE_CONNECTOR_POSTHOG_API_KEY as string | undefined;
const REGION = (import.meta.env.VITE_LOVABLE_CONNECTOR_POSTHOG_REGION as string) || "eu";
const API_HOST = REGION === "us" ? "https://us.i.posthog.com" : "https://eu.i.posthog.com";

let started = false;

export function initPostHog() {
  if (started || !TOKEN) return;
  started = true;
  posthog.init(TOKEN, {
    api_host: API_HOST,
    person_profiles: "identified_only",
    capture_pageview: false,
    autocapture: false,
    mask_all_text: true,
    disable_session_recording: true,
  });
}

export function posthogEnabled() {
  return started;
}

export function phIdentify(userId: string, props?: Record<string, unknown>) {
  if (!started) return;
  posthog.identify(userId, props);
}

export function phReset() {
  if (!started) return;
  posthog.reset();
}

export function phCapture(event: string, props?: Record<string, unknown>) {
  if (!started) return;
  posthog.capture(event, props);
}

export function phPageview(path: string) {
  if (!started) return;
  posthog.capture("$pageview", { $current_url: path });
}
