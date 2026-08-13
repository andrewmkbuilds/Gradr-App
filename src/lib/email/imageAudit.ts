/**
 * Image auditing for rendered email HTML.
 *
 * Broken images in email are silent: no console, no error, just an empty box
 * in the recipient's inbox. So every image referenced by a template is pulled
 * out of the rendered HTML and checked to be publicly reachable (HTTP 200)
 * with an actual image MIME type — no auth, no redirect chain to a login page,
 * no `text/html` error document served with a 200.
 */

const IMAGE_MIME = /^image\/(png|jpeg|jpg|gif|webp|svg\+xml|avif)$/i;

/** Every `src` referenced by an <img> in the rendered HTML, de-duplicated. */
export function extractImageUrls(html: string): string[] {
  const urls = new Set<string>();
  const imgTag = /<img\b[^>]*?\ssrc\s*=\s*("([^"]*)"|'([^']*)')/gi;
  let match: RegExpExecArray | null;
  while ((match = imgTag.exec(html)) !== null) {
    const url = (match[2] ?? match[3] ?? "").trim();
    if (url) urls.add(url);
  }
  return [...urls];
}

export interface ImageCheck {
  url: string;
  ok: boolean;
  status: number | null;
  contentType: string | null;
  reason?: string;
}

/** A mail client only fetches absolute http(s) URLs — anything else is broken. */
export function isAbsoluteHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

export async function checkImageUrl(
  url: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ImageCheck> {
  if (!isAbsoluteHttpUrl(url)) {
    return {
      url,
      ok: false,
      status: null,
      contentType: null,
      reason: url.startsWith("data:")
        ? "data: URI — most mail clients (Gmail, Outlook) refuse to render it"
        : "not an absolute https URL, so mail clients cannot resolve it",
    };
  }

  try {
    // GET, not HEAD: some CDNs answer HEAD with 405 while GET is fine.
    const res = await fetchImpl(url, { redirect: "follow" });
    const contentType = (res.headers.get("content-type") ?? "").split(";")[0]!.trim();
    if (!res.ok) {
      return { url, ok: false, status: res.status, contentType, reason: `HTTP ${res.status}` };
    }
    if (!IMAGE_MIME.test(contentType)) {
      return {
        url,
        ok: false,
        status: res.status,
        contentType,
        reason: `unexpected MIME type "${contentType || "none"}"`,
      };
    }
    return { url, ok: true, status: res.status, contentType };
  } catch (err) {
    return {
      url,
      ok: false,
      status: null,
      contentType: null,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function auditHtmlImages(
  html: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ImageCheck[]> {
  return Promise.all(extractImageUrls(html).map((u) => checkImageUrl(u, fetchImpl)));
}
