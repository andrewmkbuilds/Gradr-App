/**
 * Sentry error + performance monitoring.
 * Safe no-op when VITE_SENTRY_DSN is not configured.
 */
import * as Sentry from "@sentry/react";
import { consentFor } from "@/lib/cookieConsent";

const DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined;
const RELEASE =
  (import.meta.env.VITE_APP_RELEASE as string | undefined) ||
  `gradr@${import.meta.env.MODE}-${import.meta.env.DEV ? "dev" : "build"}`;

let started = false;

/** Strip anything that could carry personal content out of the payload. */
const SENSITIVE_KEYS =
  /(email|password|token|secret|api[_-]?key|authorization|resume|transcript|cover_letter|phone|address)/i;

function scrub<T>(value: T): T {
  if (!value || typeof value !== "object") return value;
  const out: Record<string, unknown> = Array.isArray(value) ? ([] as never) : {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = SENSITIVE_KEYS.test(k) ? "[redacted]" : scrub(v);
  }
  return out as T;
}

/**
 * Starts Sentry only once the visitor has accepted the "Analytics" category
 * (which the Cookie Policy lists Sentry under) and re-checks whenever the
 * choice changes. A Global Privacy Control signal keeps it off. Diagnostics
 * that fire before a decision are deliberately not collected.
 */
export function initSentry() {
  if (started || !DSN) return;
  if (!consentFor("analytics")) {
    watchConsent();
    return;
  }
  started = true;

  Sentry.init({
    dsn: DSN,
    release: RELEASE,
    environment: import.meta.env.MODE,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.breadcrumbsIntegration({ console: false }),
    ],
    tracesSampleRate: import.meta.env.PROD ? 0.2 : 1.0,
    sendDefaultPii: false,
    ignoreErrors: [
      "ResizeObserver loop limit exceeded",
      "AbortError",
      "Non-Error promise rejection captured",
    ],
    beforeBreadcrumb(crumb) {
      if (crumb.data) crumb.data = scrub(crumb.data);
      return crumb;
    },
    beforeSend(event) {
      if (event.request?.query_string) delete event.request.query_string;
      if (event.extra) event.extra = scrub(event.extra);
      return event;
    },
  });
}

let watching = false;

function watchConsent() {
  if (watching || typeof window === "undefined") return;
  watching = true;
  window.addEventListener("gradr:consent", () => {
    if (!started && consentFor("analytics")) initSentry();
  });
}

export function sentryEnabled() {
  return started;
}

/** Only non-identifying context: opaque user id + plan tier. */
export function setSentryUser(ctx: { id?: string | null; tier?: string | null } | null) {
  if (!started) return;
  if (!ctx?.id) {
    Sentry.setUser(null);
    return;
  }
  Sentry.setUser({ id: ctx.id });
  Sentry.setTag("plan_tier", ctx.tier || "free");
}

export function setSentrySession(sessionId: string | null) {
  if (!started || !sessionId) return;
  Sentry.setTag("app_session_id", sessionId);
}

export function addBreadcrumb(
  category: string,
  message: string,
  data?: Record<string, unknown>,
) {
  if (!started) return;
  Sentry.addBreadcrumb({
    category,
    message,
    level: "info",
    data: data ? scrub(data) : undefined,
  });
}

export function captureError(error: unknown, context?: Record<string, unknown>) {
  if (!started) {
    if (import.meta.env.DEV) console.error("[sentry:off]", error, context);
    return;
  }
  Sentry.captureException(error, context ? { extra: scrub(context) } : undefined);
}

export const SentryErrorBoundary = Sentry.ErrorBoundary;
export { Sentry };
