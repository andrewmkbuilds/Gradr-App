/**
 * Auth email link auditing.
 *
 * Two jobs, both credential-free:
 *
 *  1. `describeAuthActionUrl` turns the dynamic `payload.data.url` Supabase Auth
 *     hands the webhook into a *sanitized* description safe to persist: origin,
 *     path, action type, redirect target, and SHA-256 digests of the URL and of
 *     the single-use token. The token itself, the full URL, and every secret
 *     (service-role key, API keys) are NEVER stored — the digest is enough to
 *     prove "this exact link was the one we emailed" without the link staying
 *     replayable from the audit table.
 *
 *  2. `inspectAuthEmailHtml` pulls the primary button href and the plain-text
 *     fallback link out of rendered email HTML, so the admin preview page and
 *     the automated tests can both assert the button matches the dynamic URL.
 *
 * Shared by the auth webhook, the admin preview endpoint, and the test suite so
 * all three agree on what "correct" means.
 */

/** Query params that carry the single-use secret and must never be persisted. */
const SECRET_PARAMS = ["token", "token_hash", "confirmation_token", "code", "access_token"];

/** Strings that must never appear in a production auth email. */
export const FORBIDDEN_EMAIL_STRINGS = ["lovable.app", "gradr-app", "localhost", "127.0.0.1"];

export interface AuthActionUrlDescription {
  /** `https://<project>.supabase.co` or the custom auth origin. */
  origin: string | null;
  path: string | null;
  /** `type` query param: signup | recovery | magiclink | invite | email_change. */
  linkType: string | null;
  /** Where the user lands after the token is verified. */
  redirectTo: string | null;
  /** Which secret param was present (name only, never the value). */
  tokenParam: string | null;
  /** SHA-256 of the secret param value, truncated — correlation without replay. */
  tokenDigest: string | null;
  /** SHA-256 of the whole action URL, truncated. */
  urlDigest: string | null;
  /** The URL with every secret param value replaced by `[redacted]`. */
  redactedUrl: string | null;
  valid: boolean;
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Sanitized, non-replayable description of a dynamic auth action URL. */
export async function describeAuthActionUrl(url: unknown): Promise<AuthActionUrlDescription> {
  const empty: AuthActionUrlDescription = {
    origin: null,
    path: null,
    linkType: null,
    redirectTo: null,
    tokenParam: null,
    tokenDigest: null,
    urlDigest: null,
    redactedUrl: null,
    valid: false,
  };
  if (typeof url !== "string" || !/^https?:\/\//i.test(url)) return empty;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return empty;
  }

  const tokenParam = SECRET_PARAMS.find((p) => parsed.searchParams.get(p)) ?? null;
  const tokenValue = tokenParam ? parsed.searchParams.get(tokenParam)! : null;

  const redacted = new URL(parsed.toString());
  for (const param of SECRET_PARAMS) {
    if (redacted.searchParams.has(param)) redacted.searchParams.set(param, "[redacted]");
  }

  return {
    origin: parsed.origin,
    path: parsed.pathname,
    linkType: parsed.searchParams.get("type"),
    redirectTo: parsed.searchParams.get("redirect_to"),
    tokenParam,
    tokenDigest: tokenValue ? (await sha256Hex(tokenValue)).slice(0, 32) : null,
    urlDigest: (await sha256Hex(url)).slice(0, 32),
    redactedUrl: redacted.toString(),
    valid: true,
  };
}

export interface AuthEmailLinkInspection {
  /** href of the primary CTA button. */
  buttonHref: string | null;
  /** Action links repeated as copy/paste fallback text in the body. */
  fallbackLinks: string[];
  /** Every href in the document, in order. */
  allHrefs: string[];
  /** Hrefs that are neither the action link nor a plain brand/footer link. */
  externalHrefs: string[];
  /** Forbidden host strings found anywhere in the HTML. */
  forbidden: string[];
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&#x2F;/gi, "/")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

/** Extract every href from rendered email HTML, entity-decoded. */
export function extractHrefs(html: string): string[] {
  return Array.from(html.matchAll(/href=("|')([^"']*)\1/gi)).map((m) => decodeEntities(m[2]!));
}

/**
 * Inspect rendered auth email HTML.
 *
 * The primary button is the first anchor rendered inside the CTA table — in
 * practice the first href that carries an auth token param, falling back to the
 * first non-brand link so a malformed template still reports something.
 */
export function inspectAuthEmailHtml(html: string, brandOrigin = "https://gradr.me"): AuthEmailLinkInspection {
  const allHrefs = extractHrefs(html);
  const isActionLink = (href: string) =>
    SECRET_PARAMS.some((p) => href.includes(`${p}=`)) || /[?&]type=/.test(href);

  const buttonHref = allHrefs.find(isActionLink) ?? allHrefs.find((h) => h !== brandOrigin) ?? null;

  // The copy/paste fallback is emitted as body text, not as an anchor.
  const text = html.replace(/<[^>]+>/g, " ");
  const fallbackLinks = Array.from(text.matchAll(/https?:\/\/[^\s<>"']+/g))
    .map((m) => decodeEntities(m[0]))
    .filter(isActionLink);

  const externalHrefs = allHrefs.filter(
    (href) => !isActionLink(href) && !href.startsWith(brandOrigin) && !href.startsWith("mailto:"),
  );

  const lower = html.toLowerCase();
  const forbidden = FORBIDDEN_EMAIL_STRINGS.filter((needle) => lower.includes(needle));

  return { buttonHref, fallbackLinks, allHrefs, externalHrefs, forbidden };
}

/** True when the rendered button and every fallback link equal the dynamic URL. */
export function linksMatchActionUrl(inspection: AuthEmailLinkInspection, actionUrl: string): boolean {
  if (inspection.buttonHref !== actionUrl) return false;
  return inspection.fallbackLinks.every((link) => link === actionUrl);
}
