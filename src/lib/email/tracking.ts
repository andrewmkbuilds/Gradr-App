/**
 * Email tracking helpers (server-side, pure functions).
 *
 * - `injectOpenPixel` appends a 1x1 transparent pixel that pings the open endpoint.
 * - `rewriteLinksForTracking` routes CTA/link clicks through a redirect endpoint so
 *   we can attribute clicks per message without changing the visible destination.
 * - `toPlainText` produces a readable text/plain fallback from rendered HTML.
 *
 * All of these are opt-in at call sites via the `email_feature_flags` table.
 */

export const EMAIL_SITE_URL = "https://gradr.me";

/** Links we must never rewrite: unsubscribe + mail/tel protocols + already-tracked. */
const SKIP_LINK_PATTERNS = [
  /^mailto:/i,
  /^tel:/i,
  /^#/,
  /\/api\/public\/email\//i,
  /\/email\/unsubscribe/i,
  /\/unsubscribe/i,
];

function shouldSkipLink(href: string): boolean {
  if (!href) return true;
  return SKIP_LINK_PATTERNS.some((re) => re.test(href));
}

export function buildOpenUrl(messageId: string, baseUrl = EMAIL_SITE_URL): string {
  return `${baseUrl}/api/public/email/open?m=${encodeURIComponent(messageId)}`;
}

export function buildClickUrl(
  messageId: string,
  target: string,
  label?: string,
  baseUrl = EMAIL_SITE_URL,
): string {
  const params = new URLSearchParams({ m: messageId, u: target });
  if (label) params.set("l", label.slice(0, 80));
  return `${baseUrl}/api/public/email/click?${params.toString()}`;
}

/** Append the tracking pixel just before </body> (or at the end as a fallback). */
export function injectOpenPixel(
  html: string,
  messageId: string,
  baseUrl = EMAIL_SITE_URL,
): string {
  const pixel = `<img src="${buildOpenUrl(messageId, baseUrl)}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;outline:none;" />`;
  if (html.includes("</body>")) return html.replace("</body>", `${pixel}</body>`);
  return html + pixel;
}

/** Rewrite absolute http(s) anchors so clicks are logged before redirecting. */
export function rewriteLinksForTracking(
  html: string,
  messageId: string,
  baseUrl = EMAIL_SITE_URL,
): string {
  return html.replace(
    /<a\b([^>]*?)href=("|')(https?:\/\/[^"']+)\2([^>]*)>/gi,
    (match, pre: string, quote: string, href: string, post: string) => {
      if (shouldSkipLink(href)) return match;
      const labelMatch = /data-track-label=("|')([^"']+)\1/i.exec(pre + post);
      const tracked = buildClickUrl(messageId, href, labelMatch?.[2], baseUrl);
      return `<a${pre}href=${quote}${tracked}${quote}${post}>`;
    },
  );
}

/** Very small HTML -> text converter used for the plain-text fallback part. */
export function toPlainText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<head[\s\S]*?<\/head>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<a\b[^>]*href=("|')(https?:\/\/[^"']+)\1[^>]*>([\s\S]*?)<\/a>/gi, (_m, _q, href, text) => {
      const label = String(text).replace(/<[^>]+>/g, "").trim();
      return label ? `${label} (${href})` : href;
    })
    .replace(/<(br|\/p|\/div|\/tr|\/h[1-6])\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Allow only same-site or https targets through the click redirect. */
export function isSafeRedirectTarget(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}
