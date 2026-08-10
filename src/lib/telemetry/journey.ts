/**
 * Career journey telemetry.
 *
 * One typed surface for the end-to-end funnel. Every event fans out to:
 *  - PostHog (product analytics)
 *  - Sentry breadcrumbs (so crashes carry the journey that led to them)
 *  - the existing internal analytics_events table via trackEvent
 *
 * Rule: NEVER pass free text (resume content, transcripts, emails, job
 * descriptions, company-confidential notes). Ids, enums, counts and scores only.
 */
import { trackEvent } from "@/lib/analytics";
import { phCapture, phIdentify, phReset, initPostHog, posthogEnabled } from "./posthog";
import {
  addBreadcrumb,
  initSentry,
  sentryEnabled,
  setSentrySession,
  setSentryUser,
} from "./sentry";

export type JourneyEvent =
  | "job_url_import_started"
  | "job_url_import_completed"
  | "job_url_import_failed"
  | "job_match_started"
  | "job_match_completed"
  | "company_research_viewed"
  | "application_created"
  | "interview_started"
  | "interview_completed"
  | "interview_report_generated"
  | "resume_analyzed"
  | "integration_connected"
  | "integration_disconnected";

export type JourneyProps = Record<string, string | number | boolean | null | undefined>;

const SAFE_VALUE_MAX = 64;

function sanitize(props: JourneyProps): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null) continue;
    if (typeof v === "string") {
      // Never ship long free text or anything email-shaped.
      if (v.length > SAFE_VALUE_MAX || v.includes("@")) continue;
      out[k] = v;
    } else {
      out[k] = v;
    }
  }
  return out;
}

export function initTelemetry() {
  initSentry();
  initPostHog();
}

export function telemetryStatus() {
  return { sentry: sentryEnabled(), posthog: posthogEnabled() };
}

export function identifyUser(userId: string | null, tier?: string | null) {
  if (!userId) {
    phReset();
    setSentryUser(null);
    return;
  }
  phIdentify(userId, { plan_tier: tier || "free" });
  setSentryUser({ id: userId, tier });
}

export function setSessionContext(sessionId: string | null) {
  setSentrySession(sessionId);
}

export function trackJourney(event: JourneyEvent, props: JourneyProps = {}) {
  const safe = sanitize(props);
  phCapture(event, safe);
  addBreadcrumb("journey", event, safe);
  trackEvent(event, safe as JourneyProps);
}
