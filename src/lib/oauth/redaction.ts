/**
 * OAuth forensics redaction.
 *
 * Every value that reaches the forensics log, the admin UI or an export goes
 * through here first. Redaction happens at the data layer (and again in a
 * database trigger) so a "hidden" secret can never leak through a CSV/PDF
 * download that bypasses the UI.
 */

/** Query/fragment parameters that carry authentication material. */
export const SENSITIVE_OAUTH_PARAMS = [
  "code",
  "access_token",
  "refresh_token",
  "id_token",
  "client_secret",
  "credential",
  "assertion",
  "token",
  "password",
  "session_state",
  "authuser",
] as const;

export const REDACTED = "[REDACTED]";

/** Strips sensitive query/fragment params from a URL-ish string. */
export function redactUrl(value: string | null | undefined): string {
  if (!value) return "";
  let out = String(value);
  for (const param of SENSITIVE_OAUTH_PARAMS) {
    out = out.replace(new RegExp(`([?&#]${param}=)[^&#\\s]*`, "gi"), `$1${REDACTED}`);
  }
  // Bare bearer tokens / JWTs that appear in free text.
  out = out.replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+/g, REDACTED);
  out = out.replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, `Bearer ${REDACTED}`);
  return out;
}

/** Recursively redacts an arbitrary metadata object. */
export function redactMetadata(input: unknown): unknown {
  if (input === null || input === undefined) return input;
  if (typeof input === "string") return redactUrl(input);
  if (Array.isArray(input)) return input.map(redactMetadata);
  if (typeof input === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      out[key] = (SENSITIVE_OAUTH_PARAMS as readonly string[]).includes(key.toLowerCase())
        ? REDACTED
        : redactMetadata(value);
    }
    return out;
  }
  return input;
}

/** True when a string still contains anything that looks like a credential. */
export function containsSensitive(value: string): boolean {
  if (/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\./.test(value)) return true;
  return SENSITIVE_OAUTH_PARAMS.some((param) =>
    new RegExp(`[?&#]${param}=(?!\\[REDACTED\\])[^&#\\s]+`, "i").test(value),
  );
}
