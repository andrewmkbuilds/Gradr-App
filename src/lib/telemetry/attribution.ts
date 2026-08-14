/**
 * Acquisition attribution.
 *
 * First-touch UTM/referrer data captured on the very first page of a visit and
 * kept for the whole journey, so a payment that happens days later can still be
 * credited to the campaign that produced the visitor.
 *
 * Only campaign metadata is stored — never query strings wholesale, never PII.
 */
import { safeStorage } from "@/lib/safeStorage";

const KEY = "gradr_attribution";
const MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;

export interface Attribution {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  referrer_domain?: string;
  landing_page?: string;
  acquisition_source: string;
  captured_at: string;
}

const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;

function clean(value: string | null): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim().slice(0, 64);
  return trimmed ? trimmed : undefined;
}

function referrerDomain(): string | undefined {
  if (typeof document === "undefined" || !document.referrer) return undefined;
  try {
    const url = new URL(document.referrer);
    if (url.hostname === window.location.hostname) return undefined;
    return url.hostname.replace(/^www\./, "").slice(0, 64);
  } catch {
    return undefined;
  }
}

/** Current-URL UTM parameters (not the stored first-touch ones). */
export function currentUtms(): Partial<Record<(typeof UTM_KEYS)[number], string>> {
  if (typeof window === "undefined") return {};
  const params = new URLSearchParams(window.location.search);
  const out: Record<string, string> = {};
  for (const key of UTM_KEYS) {
    const value = clean(params.get(key));
    if (value) out[key] = value;
  }
  return out;
}

/**
 * Classifies the visit into a coarse channel so funnels can be split by source
 * without needing every campaign name.
 */
function classify(utms: Record<string, string | undefined>, referrer?: string): string {
  if (utms.utm_source) return utms.utm_source.toLowerCase();
  if (!referrer) return "direct";
  if (/google|bing|duckduckgo|yahoo|ecosia|brave/.test(referrer)) return "organic_search";
  if (/linkedin|twitter|x\.com|facebook|instagram|reddit|tiktok|youtube/.test(referrer)) return "social";
  return "referral";
}

export function readAttribution(): Attribution | null {
  const raw = safeStorage.get(KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Attribution;
    if (!parsed?.captured_at) return null;
    if (Date.now() - Date.parse(parsed.captured_at) > MAX_AGE_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Stores first-touch attribution once per visitor. A later visit carrying new
 * UTM parameters records a fresh last-touch source but keeps the original
 * first-touch record intact.
 */
export function captureAttribution(): Attribution {
  const existing = readAttribution();
  const utms = currentUtms();
  const referrer = referrerDomain();

  if (existing) {
    // Last-touch only matters when this visit actually carries a campaign.
    return Object.keys(utms).length
      ? { ...existing, acquisition_source: classify(utms, referrer) }
      : existing;
  }

  const record: Attribution = {
    ...utms,
    referrer_domain: referrer,
    landing_page: typeof window === "undefined" ? undefined : window.location.pathname.slice(0, 96),
    acquisition_source: classify(utms, referrer),
    captured_at: new Date().toISOString(),
  };
  safeStorage.set(KEY, JSON.stringify(record));
  return record;
}

/** Attribution flattened into event properties. */
export function attributionProps(): Record<string, string> {
  const stored = readAttribution();
  const live = currentUtms();
  const merged: Record<string, string> = {};
  if (stored) {
    for (const key of UTM_KEYS) {
      const value = stored[key];
      if (value) merged[key] = value;
    }
    if (stored.referrer_domain) merged.referrer_domain = stored.referrer_domain;
    merged.acquisition_source = stored.acquisition_source;
  }
  // A campaign on the current URL wins for this event.
  return { ...merged, ...live };
}
