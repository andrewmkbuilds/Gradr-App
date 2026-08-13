/**
 * Redaction of sensitive OAuth material.
 *
 * Redirect chains captured during sign-in contain live credentials in the query
 * string (`code`, `id_token`, `access_token`, …) and CSRF material (`state`,
 * `nonce`). Those must never be rendered in the admin console or written into
 * an export that gets attached to a Safe Browsing report — the report is
 * evidence, not a credential dump.
 *
 * The redaction keeps the *shape* of the URL (host, path, which params were
 * present) because that is exactly what the evidence needs to prove, and
 * replaces only the value.
 */

export const SENSITIVE_OAUTH_PARAMS = [
  "code",
  "code_verifier",
  "credential",
  "access_token",
  "refresh_token",
  "id_token",
  "token",
  "id_token_hint",
  "state",
  "nonce",
  "session_state",
  "authuser",
  "client_secret",
  "assertion",
  "jwt",
  "apikey",
  "api_key",
] as const;

const SENSITIVE = new Set<string>(SENSITIVE_OAUTH_PARAMS.map((p) => p.toLowerCase()));

/** `[redacted:12]` keeps the length as a forensic signal without the value. */
const mask = (value: string) => `[redacted:${value.length}]`;

function redactSearchString(search: string): { out: string; changed: boolean } {
  let changed = false;
  const parts = search.split("&").map((pair) => {
    if (!pair) return pair;
    const eq = pair.indexOf("=");
    const rawKey = eq === -1 ? pair : pair.slice(0, eq);
    const rawValue = eq === -1 ? "" : pair.slice(eq + 1);
    if (!SENSITIVE.has(decodeURIComponent(rawKey).toLowerCase()) || !rawValue) return pair;
    changed = true;
    return `${rawKey}=${mask(rawValue)}`;
  });
  return { out: parts.join("&"), changed };
}

/**
 * Redacts sensitive query and fragment params from a URL. Non-URL strings are
 * returned untouched so the caller can pass anything from a stored record.
 */
export function redactOAuthUrl(input: string | null | undefined): string {
  if (!input) return input ?? "";
  const value = String(input);

  // Work on the raw string so malformed/relative URLs still get scrubbed.
  const hashIndex = value.indexOf("#");
  const head = hashIndex === -1 ? value : value.slice(0, hashIndex);
  const fragment = hashIndex === -1 ? "" : value.slice(hashIndex + 1);

  const qIndex = head.indexOf("?");
  const base = qIndex === -1 ? head : head.slice(0, qIndex);
  const query = qIndex === -1 ? "" : head.slice(qIndex + 1);

  const q = query ? redactSearchString(query) : { out: "", changed: false };
  // Implicit-flow tokens arrive in the fragment, so it gets the same treatment.
  const f = fragment ? redactSearchString(fragment) : { out: "", changed: false };

  let out = base;
  if (query) out += `?${q.out}`;
  if (fragment) out += `#${f.out}`;
  return out;
}

/** True when the URL carried at least one sensitive param before redaction. */
export function hasSensitiveParams(input: string | null | undefined): boolean {
  if (!input) return false;
  return redactOAuthUrl(input) !== String(input);
}

export interface RedactableHop {
  order?: number;
  url?: string;
  kind?: string;
  at?: string;
  note?: string | null;
  [key: string]: unknown;
}

export function redactHops<T extends RedactableHop>(hops: T[] | null | undefined): T[] {
  if (!Array.isArray(hops)) return [];
  return hops.map((hop) => ({ ...hop, url: redactOAuthUrl(hop.url ?? "") }));
}

/** Redacts every URL-bearing field on a stored trace/check row. */
export function redactTraceRow<T extends object>(row: T): T {
  const next: Record<string, unknown> = { ...row };
  for (const key of ["start_url", "final_url", "expected_redirect_uri", "redirect_uri", "expected_final_url"]) {
    if (typeof next[key] === "string") next[key] = redactOAuthUrl(next[key] as string);
  }
  if (Array.isArray(next["hops"])) next["hops"] = redactHops(next["hops"] as RedactableHop[]);
  return next as T;
}
