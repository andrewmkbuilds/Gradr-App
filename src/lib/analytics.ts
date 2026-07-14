/**
 * Lightweight client analytics.
 * - Pushes to window.dataLayer (GTM/GA4 compatible)
 * - Dispatches a CustomEvent("app:analytics") for local listeners
 * - Persists events to Lovable Cloud (analytics_events table) for the
 *   internal admin dashboard
 *
 * Safe no-op on SSR.
 */
import { supabase } from "@/integrations/supabase/client";

export type AnalyticsProps = Record<string, string | number | boolean | undefined | null>;

declare global {
  interface Window {
    dataLayer?: Array<Record<string, unknown>>;
  }
}

const SESSION_KEY = "cf_session_id";

function getSessionId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    let sid = window.sessionStorage.getItem(SESSION_KEY);
    if (!sid) {
      sid = crypto.randomUUID();
      window.sessionStorage.setItem(SESSION_KEY, sid);
    }
    return sid;
  } catch {
    return null;
  }
}

function getUtms() {
  if (typeof window === "undefined") return {};
  try {
    const p = new URLSearchParams(window.location.search);
    return {
      utm_source: p.get("utm_source"),
      utm_medium: p.get("utm_medium"),
      utm_campaign: p.get("utm_campaign"),
      utm_content: p.get("utm_content"),
    };
  } catch {
    return {};
  }
}

async function persistEvent(event: string, props: AnalyticsProps) {
  try {
    const utms = getUtms();
    const { data: auth } = await supabase.auth.getUser();
    const row = {
      event_name: event,
      article: (props.article as string) ?? null,
      location: (props.location as string) ?? null,
      destination: (props.destination as string) ?? null,
      path: typeof window !== "undefined" ? window.location.pathname : null,
      referrer: typeof document !== "undefined" ? document.referrer || null : null,
      utm_source: (props.utm_source as string) ?? utms.utm_source ?? null,
      utm_medium: (props.utm_medium as string) ?? utms.utm_medium ?? null,
      utm_campaign: (props.utm_campaign as string) ?? utms.utm_campaign ?? null,
      utm_content: (props.utm_content as string) ?? utms.utm_content ?? null,
      session_id: getSessionId(),
      user_id: auth?.user?.id ?? null,
      metadata: props as Record<string, unknown>,
    };
    await supabase.from("analytics_events").insert([row]);
  } catch {
    /* fire-and-forget */
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
  void persistEvent(event, props);
}

/**
 * Append UTM parameters to an internal path.
 * Preserves existing query string; does not overwrite existing utm_* values.
 */
export function withUtm(
  path: string,
  utm: { source: string; medium: string; campaign: string; content?: string },
): string {
  const [base, query = ""] = path.split("?");
  const params = new URLSearchParams(query);
  if (!params.has("utm_source")) params.set("utm_source", utm.source);
  if (!params.has("utm_medium")) params.set("utm_medium", utm.medium);
  if (!params.has("utm_campaign")) params.set("utm_campaign", utm.campaign);
  if (utm.content && !params.has("utm_content")) params.set("utm_content", utm.content);
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}
