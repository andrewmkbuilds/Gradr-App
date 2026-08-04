/**
 * Affiliate referral tracking — 90-day cookie attribution.
 *
 * Flow:
 *  1. captureReferralFromUrl()  — runs on app load. If `?ref=CODE` present,
 *     validates the code via `lookup_affiliate_by_code`, sets a cookie for
 *     `affiliate_settings.cookie_duration_days` days (default 90), and writes
 *     an `affiliate_clicks` row.
 *  2. getReferralCookie() / getClickId() — read current tracking values.
 *  3. attributeSignupReferral() — called right after a user successfully
 *     signs up, calls `attribute_signup_referral` RPC and clears the cookie.
 */
import { supabase } from "@/integrations/supabase/client";

const COOKIE_NAME = "cf_ref";
const CLICK_COOKIE_NAME = "cf_ref_click";
const VISITOR_KEY = "cf_visitor_key";
const DEFAULT_DAYS = 90;

function setCookie(name: string, value: string, days: number) {
  if (typeof document === "undefined") return;
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
}

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.split("; ").find((c) => c.startsWith(name + "="));
  return match ? decodeURIComponent(match.split("=")[1]) : null;
}

function clearCookie(name: string) {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
}

function getVisitorKey(): string {
  let key = localStorage.getItem(VISITOR_KEY);
  if (!key) {
    key = crypto.randomUUID();
    localStorage.setItem(VISITOR_KEY, key);
  }
  return key;
}

export function getReferralCookie(): string | null {
  return getCookie(COOKIE_NAME);
}

export function getClickId(): string | null {
  return getCookie(CLICK_COOKIE_NAME);
}

export async function captureReferralFromUrl() {
  try {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const code = params.get("ref");
    if (!code) return;

    // Validate the code (RPC returns array)
    const { data: lookup } = await supabase.rpc("lookup_affiliate_by_code", { _code: code });
    const hit = Array.isArray(lookup) ? lookup[0] : null;
    if (!hit || !hit.is_active) return;

    // Pull cookie duration from public settings, fall back to 90.
    let days = DEFAULT_DAYS;
    const { data: settingsRows } = await supabase.rpc("get_affiliate_public_settings");
    const settings = Array.isArray(settingsRows) ? settingsRows[0] : settingsRows;
    if (settings?.cookie_duration_days) days = settings.cookie_duration_days;

    setCookie(COOKIE_NAME, code, days);

    // Log click
    const utm_source = params.get("utm_source");
    const utm_medium = params.get("utm_medium");
    const utm_campaign = params.get("utm_campaign");

    const { data: click } = await supabase
      .from("affiliate_clicks")
      .insert({
        affiliate_profile_id: hit.profile_id,
        affiliate_code: code,
        landing_page: window.location.pathname + window.location.search,
        utm_source,
        utm_medium,
        utm_campaign,
        visitor_key: getVisitorKey(),
        user_agent: navigator.userAgent.slice(0, 500),
      })
      .select("id")
      .single();

    if (click?.id) setCookie(CLICK_COOKIE_NAME, click.id, days);
  } catch (e) {
    // Tracking is best-effort — never block the app
    console.warn("[affiliate] capture failed", e);
  }
}

export async function attributeSignupReferral() {
  const code = getReferralCookie();
  if (!code) return;
  try {
    const clickId = getClickId();
    const { data } = await supabase.rpc("attribute_signup_referral", {
      _code: code,
      _click_id: clickId,
    });
    if (data) {
      // Successfully attributed — clear cookie to prevent re-attribution
      clearCookie(COOKIE_NAME);
      clearCookie(CLICK_COOKIE_NAME);
    }
  } catch (e) {
    console.warn("[affiliate] signup attribution failed", e);
  }
}
