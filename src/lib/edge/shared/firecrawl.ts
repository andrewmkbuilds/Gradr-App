// Firecrawl gateway helper (server-only).
// Connection is gateway-backed: LOVABLE_API_KEY + X-Connection-Api-Key.

const GATEWAY_V2 = "https://connector-gateway.lovable.dev/firecrawl/v2";

export class FirecrawlError extends Error {
  status: number;
  code:
    | "not_configured"
    | "invalid_url"
    | "blocked"
    | "not_found"
    | "rate_limited"
    | "no_credits"
    | "timeout"
    | "empty"
    | "upstream";
  constructor(code: FirecrawlError["code"], message: string, status = 502) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function keys() {
  const lovable = process.env['LOVABLE_API_KEY'];
  const conn = process.env['FIRECRAWL_API_KEY'];
  if (!lovable || !conn) {
    throw new FirecrawlError(
      "not_configured",
      "Web extraction is not configured for this workspace.",
      503,
    );
  }
  return { lovable, conn };
}

async function call(path: string, body: unknown, timeoutMs = 45_000) {
  const { lovable, conn } = keys();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(`${GATEWAY_V2}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${lovable}`,
        "X-Connection-Api-Key": conn,
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") {
      throw new FirecrawlError("timeout", "The page took too long to load.", 504);
    }
    throw new FirecrawlError("upstream", "Could not reach the extraction service.");
  } finally {
    clearTimeout(timer);
  }

  const text = await res.text();
  if (!res.ok) {
    console.error(`firecrawl ${path} failed [${res.status}]: ${text.slice(0, 500)}`);
    if (res.status === 402) {
      throw new FirecrawlError("no_credits", "Web extraction credits are exhausted.", 402);
    }
    if (res.status === 429) {
      throw new FirecrawlError("rate_limited", "Too many extraction requests. Try again shortly.", 429);
    }
    if (res.status === 403 || res.status === 401) {
      throw new FirecrawlError("blocked", "This site blocked automated access.", 422);
    }
    if (res.status === 404) {
      throw new FirecrawlError("not_found", "That page could not be found.", 404);
    }
    throw new FirecrawlError("upstream", "The extraction service returned an error.");
  }

  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new FirecrawlError("upstream", "The extraction service returned an unreadable response.");
  }
}

type Doc = { markdown?: string; json?: unknown; metadata?: Record<string, unknown> };

function unwrap(result: Record<string, unknown>): Doc {
  const data = (result.data ?? result) as Doc;
  return data;
}

export async function scrape(
  url: string,
  opts: { formats?: unknown[]; onlyMainContent?: boolean; waitFor?: number } = {},
): Promise<Doc> {
  const result = await call("/scrape", {
    url,
    formats: opts.formats ?? ["markdown"],
    onlyMainContent: opts.onlyMainContent ?? true,
    waitFor: opts.waitFor,
  });
  const doc = unwrap(result);
  if (!doc.markdown && !doc.json) {
    throw new FirecrawlError(
      "empty",
      "No readable content was found on that page — it may require a login or be behind a paywall.",
      422,
    );
  }
  return doc;
}

export type SearchHit = { url: string; title?: string; description?: string; markdown?: string };

export async function search(
  query: string,
  opts: { limit?: number; scrape?: boolean; tbs?: string } = {},
): Promise<SearchHit[]> {
  const result = await call("/search", {
    query,
    limit: opts.limit ?? 5,
    tbs: opts.tbs,
    scrapeOptions: opts.scrape ? { formats: ["markdown"] } : undefined,
  });
  const hits = (result.data ?? result.web ?? []) as SearchHit[];
  return Array.isArray(hits) ? hits : [];
}

/** SSRF-safe validation for user-supplied URLs. */
export function assertSafeUrl(raw: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new FirecrawlError("invalid_url", "That doesn't look like a valid link.", 400);
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new FirecrawlError("invalid_url", "Only http and https links are supported.", 400);
  }
  const host = parsed.hostname.toLowerCase();
  if (host === "localhost" || host === "0.0.0.0" || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new FirecrawlError("invalid_url", "Internal hostnames are not allowed.", 400);
  }
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
    if (a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a === 0 || a >= 224) {
      throw new FirecrawlError("invalid_url", "Private addresses are not allowed.", 400);
    }
  }
  if (host.includes(":") || host.startsWith("[")) {
    throw new FirecrawlError("invalid_url", "IPv6 literals are not allowed.", 400);
  }
  return parsed;
}
