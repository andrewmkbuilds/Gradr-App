/**
 * Trust evaluation for third-party OAuth clients shown on the Gradr consent page.
 *
 * Why this exists
 * ---------------
 * `/.lovable/oauth/consent` is a *gradr.me* URL that renders a name supplied by
 * whoever registered the OAuth client, next to an "Approve" button that hands
 * that party an access token and redirects the browser off-site. Rendered
 * naively, that is indistinguishable from a phishing page: a stranger could
 * register a client called "Google Account Verification" and send victims to a
 * legitimate-looking Gradr URL. Google Safe Browsing classifies exactly that
 * pattern as a deceptive page.
 *
 * The fix is defence in depth:
 *  1. dynamic client registration is disabled at the auth server (no stranger
 *     can create a client at all),
 *  2. the displayed name is sanitised — no markup, no URLs, no control
 *     characters, hard length cap,
 *  3. names impersonating a well-known brand are flagged and the page refuses
 *     to present them as trusted,
 *  4. the real redirect destination is always shown in full.
 */

/** Brands an OAuth client on Gradr has no legitimate reason to be named after. */
const IMPERSONATED_BRANDS = [
  "google",
  "gmail",
  "youtube",
  "microsoft",
  "outlook",
  "office365",
  "azure",
  "apple",
  "icloud",
  "linkedin",
  "facebook",
  "meta",
  "instagram",
  "amazon",
  "aws",
  "paypal",
  "stripe",
  "paddle",
  "supabase",
  "lovable",
  "okta",
  "auth0",
  "indeed",
  "glassdoor",
  "workday",
  "greenhouse",
  "docusign",
  "dropbox",
  "slack",
  "notion",
  "gradr",
];

/** Words that make a name read like a security prompt rather than an app name. */
const ALARMIST_TERMS = [
  "verify",
  "verification",
  "security alert",
  "suspended",
  "urgent",
  "password",
  "billing update",
  "account recovery",
  "sign in",
  "login",
  "支付",
];

const MAX_NAME_LENGTH = 64;

/**
 * Strips anything that lets a client name masquerade as UI chrome: markup,
 * URLs, control characters, bidi overrides and runaway whitespace.
 */
export function sanitizeClientName(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const cleaned = raw
    // Control chars + bidi overrides (RLO tricks reverse displayed text).
    .replace(/[\u0000-\u001f\u007f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/[<>{}$`\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.slice(0, MAX_NAME_LENGTH);
}

export interface ClientTrustVerdict {
  /** Safe-to-render name, already sanitised. Empty when nothing usable remains. */
  displayName: string;
  /** True when the name impersonates a known brand or reads like a security prompt. */
  suspicious: boolean;
  /** Human-readable reasons, shown verbatim to the user. */
  reasons: string[];
}

export function evaluateClientName(raw: unknown): ClientTrustVerdict {
  const displayName = sanitizeClientName(raw);
  const reasons: string[] = [];
  const haystack = displayName.toLowerCase();

  if (!displayName) {
    return {
      displayName: "",
      reasons: ["This app did not provide a readable name."],
      suspicious: true,
    };
  }

  for (const brand of IMPERSONATED_BRANDS) {
    if (new RegExp(`(^|[^a-z0-9])${brand}([^a-z0-9]|$)`, "i").test(haystack)) {
      reasons.push(`This app calls itself "${displayName}", which imitates ${brand}. Gradr did not publish it.`);
      break;
    }
  }
  for (const term of ALARMIST_TERMS) {
    if (haystack.includes(term)) {
      reasons.push("The app name is worded like a security or sign-in prompt, which legitimate apps do not do.");
      break;
    }
  }

  return { displayName, reasons, suspicious: reasons.length > 0 };
}

/**
 * Presents the redirect target so the user can see exactly where approving
 * sends them. Never hides the host and never trusts the scheme blindly.
 */
export function describeRedirectTarget(raw: unknown): { host: string; url: string; insecure: boolean } | null {
  if (typeof raw !== "string" || !raw) return null;
  try {
    const parsed = new URL(raw);
    return {
      host: parsed.host,
      url: `${parsed.origin}${parsed.pathname}`,
      insecure: parsed.protocol !== "https:" && parsed.hostname !== "localhost",
    };
  } catch {
    return null;
  }
}
