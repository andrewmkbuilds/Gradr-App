/**
 * GDPR-style cookie consent state.
 *
 * Stored in localStorage (not a cookie) so it survives without itself needing
 * consent, and read synchronously so analytics never fires before a choice.
 * Strictly necessary cookies are always on and are not represented as a toggle.
 */
export const CONSENT_STORAGE_KEY = "gradr-cookie-consent";
export const CONSENT_VERSION = 1;
/** Re-ask after 12 months, matching the retention stated in the Cookie Policy. */
export const CONSENT_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;

export type ConsentCategory = "analytics" | "marketing" | "functional";

export type ConsentChoices = Record<ConsentCategory, boolean>;

export type StoredConsent = {
  version: number;
  decidedAt: string;
  choices: ConsentChoices;
};

export const CONSENT_CATEGORIES: {
  id: ConsentCategory;
  label: string;
  description: string;
}[] = [
  {
    id: "analytics",
    label: "Analytics",
    description:
      "Product analytics (PostHog, Sentry, internal navigation events) so we can see which features work and where flows break.",
  },
  {
    id: "marketing",
    label: "Marketing & attribution",
    description:
      "Campaign measurement and the affiliate attribution cookie that credits the partner who referred you.",
  },
  {
    id: "functional",
    label: "Functional",
    description:
      "Non-essential conveniences: dismissed banners, onboarding progress and recently viewed roles.",
  },
];

export const ALL_OFF: ConsentChoices = { analytics: false, marketing: false, functional: false };
export const ALL_ON: ConsentChoices = { analytics: true, marketing: true, functional: true };

/** A Global Privacy Control signal counts as rejecting the optional categories. */
export function hasGlobalPrivacyControl(): boolean {
  if (typeof navigator === "undefined") return false;
  return (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true;
}

function safeLocalGet(): string | null {
  try {
    return window.localStorage.getItem(CONSENT_STORAGE_KEY);
  } catch {
    return null;
  }
}

function safeLocalSet(value: string): boolean {
  try {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, value);
    return window.localStorage.getItem(CONSENT_STORAGE_KEY) === value;
  } catch {
    return false;
  }
}

/**
 * Cookie fallback for environments where localStorage is unavailable or
 * partitioned (embedded previews, Safari ITP, private windows). The consent
 * record itself is strictly necessary, so storing it needs no consent.
 */
function cookieGet(): string | null {
  try {
    const match = document.cookie.match(
      new RegExp(`(?:^|; )${CONSENT_STORAGE_KEY}=([^;]*)`),
    );
    return match ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

function cookieSet(value: string): void {
  try {
    const maxAge = Math.floor(CONSENT_MAX_AGE_MS / 1000);
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${CONSENT_STORAGE_KEY}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure}`;
  } catch {
    /* nothing else to fall back to */
  }
}

export function readConsent(): StoredConsent | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = safeLocalGet() ?? cookieGet();
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredConsent;
    if (parsed?.version !== CONSENT_VERSION || !parsed.choices) return null;
    if (Date.now() - Date.parse(parsed.decidedAt) > CONSENT_MAX_AGE_MS) return null;
    return {
      version: parsed.version,
      decidedAt: parsed.decidedAt,
      choices: { ...ALL_OFF, ...parsed.choices },
    };
  } catch {
    return null;
  }
}

export function writeConsent(choices: ConsentChoices): StoredConsent {
  const record: StoredConsent = {
    version: CONSENT_VERSION,
    decidedAt: new Date().toISOString(),
    choices,
  };
  const serialised = JSON.stringify(record);
  // Always mirror to a first-party cookie so the choice survives even when
  // localStorage writes are blocked or silently dropped.
  if (!safeLocalSet(serialised)) cookieSet(serialised);
  else cookieSet(serialised);
  window.dispatchEvent(new CustomEvent<StoredConsent>("gradr:consent", { detail: record }));
  return record;
}

/** Current effective choices — used by analytics/attribution before they fire. */
export function consentFor(category: ConsentCategory): boolean {
  if (hasGlobalPrivacyControl()) return false;
  return readConsent()?.choices[category] ?? false;
}
