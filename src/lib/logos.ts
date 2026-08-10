/**
 * Logo.dev caching layer.
 *
 * Goals:
 *  - Instant loads: in-memory + localStorage cache keyed by domain/company.
 *  - Fewer API calls: dedupe in-flight lookups, cache negative results too.
 *  - Rate-limit safety: global cooldown after 429s with exponential backoff,
 *    during which we serve fallbacks instead of hammering the API.
 */

const TOKEN = import.meta.env.VITE_LOVABLE_CONNECTOR_LOGO_DEV_API_KEY as string | undefined;

const STORE_KEY = "gradr_logo_cache_v1";
const TTL_OK = 1000 * 60 * 60 * 24 * 14; // 14 days
const TTL_MISS = 1000 * 60 * 60 * 12; // 12 hours for misses

export type LogoEntry = {
  /** Resolved image URL, or null when the logo could not be resolved. */
  url: string | null;
  domain: string | null;
  ts: number;
};

type Store = Record<string, LogoEntry>;

let memory: Store | null = null;
const inflight = new Map<string, Promise<LogoEntry>>();

/** Timestamp until which we must not call Logo.dev (set on 429). */
let cooldownUntil = 0;
let cooldownMs = 0;

export function logoDevEnabled() {
  return Boolean(TOKEN);
}

export function isRateLimited() {
  return Date.now() < cooldownUntil;
}

function enterCooldown() {
  cooldownMs = cooldownMs ? Math.min(cooldownMs * 2, 10 * 60_000) : 30_000;
  cooldownUntil = Date.now() + cooldownMs;
}

function clearCooldown() {
  cooldownMs = 0;
  cooldownUntil = 0;
}

function readStore(): Store {
  if (memory) return memory;
  if (typeof window === "undefined") return (memory = {});
  try {
    memory = JSON.parse(window.localStorage.getItem(STORE_KEY) || "{}") as Store;
  } catch {
    memory = {};
  }
  return memory;
}

let flushTimer: ReturnType<typeof setTimeout> | null = null;
function writeStore() {
  if (typeof window === "undefined" || !memory) return;
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    try {
      window.localStorage.setItem(STORE_KEY, JSON.stringify(memory));
    } catch {
      /* quota — drop cache silently */
    }
  }, 250);
}

const COMMON_SUFFIXES =
  /\b(inc|inc\.|llc|ltd|ltd\.|limited|corp|corp\.|corporation|co|co\.|company|gmbh|plc|sa|bv|ag|labs|technologies|technology|group|holdings|solutions|systems)\b/gi;

/** Best-effort domain inference from a company name. */
export function guessDomain(input?: string | null): string | null {
  if (!input) return null;
  const raw = input.trim();
  if (!raw) return null;

  // Already a URL or domain
  const urlish = raw.match(/^(?:https?:\/\/)?((?:[\w-]+\.)+[a-z]{2,})(?:[/?#]|$)/i);
  if (urlish) return urlish[1].replace(/^www\./i, "").toLowerCase();

  const slug = raw
    .toLowerCase()
    .replace(COMMON_SUFFIXES, " ")
    .replace(/[^a-z0-9\s-]/g, " ")
    .trim()
    .replace(/[\s-]+/g, "");

  if (!slug || slug.length < 2) return null;
  return `${slug}.com`;
}

export function cacheKeyFor(domain: string, size: number) {
  return `${domain}@${size}`;
}

function buildUrl(domain: string, size: number) {
  const params = new URLSearchParams({
    token: TOKEN as string,
    size: String(size),
    format: "png",
    retries: "0",
  });
  return `https://img.logo.dev/${encodeURIComponent(domain)}?${params.toString()}`;
}

export function getCached(domain: string, size: number): LogoEntry | null {
  const store = readStore();
  const entry = store[cacheKeyFor(domain, size)];
  if (!entry) return null;
  const ttl = entry.url ? TTL_OK : TTL_MISS;
  if (Date.now() - entry.ts > ttl) return null;
  return entry;
}

function setCached(domain: string, size: number, entry: LogoEntry) {
  const store = readStore();
  store[cacheKeyFor(domain, size)] = entry;
  writeStore();
}

/**
 * Resolve a logo URL for a company name or domain.
 * Resolves to `{ url: null }` when unavailable — callers render initials.
 */
export function resolveLogo(
  companyOrDomain?: string | null,
  size = 128,
): Promise<LogoEntry> {
  const domain = guessDomain(companyOrDomain);
  const empty: LogoEntry = { url: null, domain, ts: Date.now() };
  if (!domain || !TOKEN) return Promise.resolve(empty);

  const cached = getCached(domain, size);
  if (cached) return Promise.resolve(cached);

  if (isRateLimited()) return Promise.resolve(empty);

  const key = cacheKeyFor(domain, size);
  const existing = inflight.get(key);
  if (existing) return existing;

  const task = (async (): Promise<LogoEntry> => {
    const src = buildUrl(domain, size);
    try {
      const res = await fetch(src, { method: "GET", cache: "force-cache" });
      if (res.status === 429) {
        enterCooldown();
        return empty;
      }
      clearCooldown();
      const ok = res.ok && (res.headers.get("content-type") || "").startsWith("image/");
      const entry: LogoEntry = { url: ok ? src : null, domain, ts: Date.now() };
      setCached(domain, size, entry);
      return entry;
    } catch {
      return empty;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, task);
  return task;
}

/** Warm the cache for a list of companies without blocking render. */
export function prefetchLogos(companies: Array<string | null | undefined>, size = 128) {
  const seen = new Set<string>();
  for (const c of companies) {
    const d = guessDomain(c);
    if (!d || seen.has(d)) continue;
    seen.add(d);
    if (getCached(d, size)) continue;
    void resolveLogo(c, size);
  }
}

export function clearLogoCache() {
  memory = {};
  try {
    window.localStorage.removeItem(STORE_KEY);
  } catch {
    /* ignore */
  }
}
