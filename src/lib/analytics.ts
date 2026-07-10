/**
 * Lightweight client analytics.
 * Pushes to window.dataLayer (GTM/GA4 compatible) and dispatches a CustomEvent
 * so any listener (PostHog, Plausible custom, etc.) can pick it up later.
 * Safe no-op on SSR.
 */
export type AnalyticsProps = Record<string, string | number | boolean | undefined | null>;

declare global {
  interface Window {
    dataLayer?: Array<Record<string, unknown>>;
  }
}

export function trackEvent(event: string, props: AnalyticsProps = {}) {
  if (typeof window === "undefined") return;
  const payload = { event, ...props, ts: Date.now() };
  try {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push(payload);
    window.dispatchEvent(new CustomEvent("app:analytics", { detail: payload }));
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.debug("[analytics]", event, props);
    }
  } catch {
    /* ignore */
  }
}
