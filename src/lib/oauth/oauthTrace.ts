/**
 * Client-side OAuth trace recorder.
 *
 * Google Safe Browsing false-positive reports need evidence, not adjectives:
 * a request id, every redirect hop with a timestamp, the redirect URI we asked
 * for, the domain the browser actually landed on, and whether the `state` /
 * `nonce` returned by the provider matched what we generated.
 *
 * `beginOAuthTrace()` runs just before the provider redirect and parks the
 * expectation in sessionStorage. `completeOAuthTrace()` runs on the /auth
 * landing, reconstructs the hop chain from the Navigation Timing API plus the
 * referrer, validates state/nonce and posts the result to the backend.
 *
 * Nothing here is a security control — the backend never trusts these rows for
 * authorisation. They exist purely as an audit trail for incident reports.
 */

const KEY = "gradr.oauth.trace";

export interface OAuthHop {
  order: number;
  url: string;
  kind: "start" | "provider" | "broker" | "callback" | "final";
  at: string;
  note?: string;
}

interface PendingTrace {
  requestId: string;
  provider: string;
  startUrl: string;
  expectedRedirectUri: string;
  state: string | null;
  nonce: string | null;
  startedAt: string;
  accountKind: string;
}

/** Domains that legitimately appear inside a Gradr OAuth round-trip. */
const KNOWN_HOPS: Array<{ match: RegExp; kind: OAuthHop["kind"]; note: string }> = [
  { match: /accounts\.google\.com/i, kind: "provider", note: "Google account chooser / consent" },
  { match: /appleid\.apple\.com/i, kind: "provider", note: "Apple ID sign-in" },
  { match: /login\.microsoftonline\.com/i, kind: "provider", note: "Microsoft sign-in" },
  { match: /oauth\.lovable\.app|\/~oauth\//i, kind: "broker", note: "Managed OAuth broker" },
  { match: /\.supabase\.co\/auth\/v1/i, kind: "broker", note: "Auth provider callback" },
  { match: /\/auth(\?|#|$)/i, kind: "callback", note: "Gradr auth landing" },
];

function classify(url: string): { kind: OAuthHop["kind"]; note: string } {
  for (const entry of KNOWN_HOPS) {
    if (entry.match.test(url)) return { kind: entry.kind, note: entry.note };
  }
  return { kind: "final", note: "Unrecognised hop" };
}

function randomId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

/** Strips codes/tokens: an audit row must never carry credentials. */
export function redactUrl(raw: string): string {
  try {
    const url = new URL(raw, window.location.origin);
    for (const param of ["code", "access_token", "refresh_token", "id_token", "provider_token"]) {
      if (url.searchParams.has(param)) url.searchParams.set(param, "[redacted]");
    }
    if (url.hash) {
      const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
      let touched = false;
      for (const param of ["access_token", "refresh_token", "provider_token", "id_token"]) {
        if (hash.has(param)) {
          hash.set(param, "[redacted]");
          touched = true;
        }
      }
      if (touched) url.hash = `#${hash.toString()}`;
    }
    return url.toString();
  } catch {
    return raw.split("#")[0] ?? raw;
  }
}

export function beginOAuthTrace(input: {
  provider: string;
  expectedRedirectUri: string;
  accountKind?: string;
}): PendingTrace | null {
  if (typeof window === "undefined") return null;
  const pending: PendingTrace = {
    requestId: randomId(),
    provider: input.provider,
    startUrl: redactUrl(window.location.href),
    expectedRedirectUri: input.expectedRedirectUri,
    state: randomId(),
    nonce: randomId(),
    startedAt: new Date().toISOString(),
    accountKind: input.accountKind ?? "unknown",
  };
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(pending));
  } catch {
    return pending;
  }
  return pending;
}

function readPending(): PendingTrace | null {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PendingTrace;
  } catch {
    return null;
  }
}

function clearPending() {
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    /* private mode */
  }
}

function observedHops(pending: PendingTrace): OAuthHop[] {
  const hops: OAuthHop[] = [
    { order: 0, url: pending.startUrl, kind: "start", at: pending.startedAt, note: "Sign-in initiated" },
  ];
  let order = 1;
  const push = (url: string, at: string) => {
    if (!url) return;
    const clean = redactUrl(url);
    if (hops.some((hop) => hop.url === clean)) return;
    const { kind, note } = classify(clean);
    hops.push({ order: order++, url: clean, kind, at, note });
  };

  const now = new Date().toISOString();
  try {
    if (document.referrer) push(document.referrer, now);
    const nav = performance.getEntriesByType("navigation")[0] as
      | (PerformanceNavigationTiming & { serverTiming?: unknown })
      | undefined;
    if (nav?.name) push(nav.name, now);
  } catch {
    /* timing API unavailable */
  }
  push(window.location.href, now);
  const last = hops[hops.length - 1];
  if (last) last.kind = "final";
  return hops;
}

/**
 * Called on the /auth landing. Returns the recorded trace, or null when this
 * page load was not the tail of an OAuth round-trip.
 */
export async function completeOAuthTrace(context: {
  userId?: string | null;
  outcome?: "success" | "error";
  errorCode?: string | null;
  errorMessage?: string | null;
} = {}): Promise<{ requestId: string; deviation: boolean } | null> {
  if (typeof window === "undefined") return null;
  const pending = readPending();
  if (!pending) return null;
  clearPending();

  const params = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const returnedState = params.get("state") ?? hash.get("state");
  const returnedNonce = params.get("nonce") ?? hash.get("nonce");
  const errorCode = context.errorCode ?? params.get("error") ?? hash.get("error");
  const errorMessage =
    context.errorMessage ?? params.get("error_description") ?? hash.get("error_description");

  const hops = observedHops(pending);
  const finalUrl = redactUrl(window.location.href);
  let finalDomain = "";
  try {
    finalDomain = new URL(finalUrl).host;
  } catch {
    finalDomain = "unknown";
  }

  const expectedHost = (() => {
    try {
      return new URL(pending.expectedRedirectUri, window.location.origin).host;
    } catch {
      return window.location.host;
    }
  })();

  const completedAt = new Date().toISOString();
  const payload = {
    action: "record" as const,
    requestId: pending.requestId,
    provider: pending.provider,
    accountKind: pending.accountKind,
    userId: context.userId ?? null,
    startedAt: pending.startedAt,
    completedAt,
    durationMs: Date.parse(completedAt) - Date.parse(pending.startedAt),
    startUrl: pending.startUrl,
    expectedRedirectUri: pending.expectedRedirectUri,
    finalUrl,
    finalDomain,
    hops,
    // The managed broker owns state/nonce; we record whether the provider
    // echoed values back and whether they matched ours when it did.
    statePresent: Boolean(returnedState),
    stateValid: returnedState ? returnedState === pending.state : null,
    noncePresent: Boolean(returnedNonce),
    nonceValid: returnedNonce ? returnedNonce === pending.nonce : null,
    outcome: errorCode ? "error" : (context.outcome ?? "success"),
    deviation: finalDomain !== expectedHost,
    errorCode: errorCode ?? null,
    errorMessage: errorMessage ?? null,
  };

  try {
    await fetch("/api/public/oauth-forensics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    });
  } catch {
    // Telemetry must never block sign-in.
  }

  return { requestId: pending.requestId, deviation: payload.deviation };
}
