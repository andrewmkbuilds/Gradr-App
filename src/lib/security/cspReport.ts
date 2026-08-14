/**
 * CSP violation monitoring.
 *
 * The policy ships in report-only mode (see the meta tag in index.html).
 * `report-uri` is ignored for meta-delivered policies, so we listen for the
 * `securitypolicyviolation` event instead and forward a de-duplicated, non-PII
 * summary to telemetry. This is the signal we need before enforcement.
 */
import { trackEvent } from "@/lib/analytics";

export interface CspViolationSummary {
  directive: string;
  blockedOrigin: string;
  documentPath: string;
  sample?: string;
}

const seen = new Set<string>();
const MAX_REPORTS = 25;

/** Reduces a violation to an origin-level, credential-free summary. */
export function summarizeViolation(event: SecurityPolicyViolationEvent): CspViolationSummary {
  let blockedOrigin = event.blockedURI || "unknown";
  try {
    if (/^https?:/i.test(blockedOrigin)) blockedOrigin = new URL(blockedOrigin).origin;
  } catch {
    /* keep the raw keyword (inline / eval / data) */
  }
  let documentPath = "/";
  try {
    documentPath = new URL(event.documentURI).pathname;
  } catch {
    /* ignore */
  }
  return {
    directive: event.effectiveDirective || event.violatedDirective || "unknown",
    blockedOrigin,
    documentPath,
    sample: event.sample ? String(event.sample).slice(0, 120) : undefined,
  };
}

/** Registers the listener. Safe to call more than once. */
export function initCspReporting() {
  if (typeof document === "undefined") return;
  document.addEventListener("securitypolicyviolation", (event) => {
    const summary = summarizeViolation(event as SecurityPolicyViolationEvent);
    const key = `${summary.directive}|${summary.blockedOrigin}`;
    if (seen.has(key) || seen.size >= MAX_REPORTS) return;
    seen.add(key);

    if (import.meta.env.DEV) {
      console.warn("[CSP report-only]", summary);
    }
    try {
      trackEvent("csp_violation", {
        directive: summary.directive,
        blocked_origin: summary.blockedOrigin,
        document_path: summary.documentPath,
        sample: summary.sample ?? null,
      });
    } catch {
      /* telemetry must never break the page */
    }
  });
}
