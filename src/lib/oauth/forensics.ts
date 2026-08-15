/**
 * Google OAuth flow forensics.
 *
 * Records each hop of a sign-in (initiate -> provider -> callback -> session)
 * so admins can reconstruct a redirect chain when Safe Browsing or a user
 * reports a suspicious flow. Everything is redacted before it leaves the tab.
 */
import { supabase } from "@/integrations/supabase/client";
import { captureError } from "@/lib/telemetry/sentry";
import { redactMetadata, redactUrl } from "./redaction";

export const PRODUCTION_APP_ORIGIN = "https://app.gradr.me";
export const EXPECTED_CALLBACK_URL = `${PRODUCTION_APP_ORIGIN}/~oauth/callback`;
export const EXPECTED_FINAL_URL = `${PRODUCTION_APP_ORIGIN}/dashboard`;

export type OAuthStage = "initiate" | "provider_redirect" | "callback" | "session" | "deviation";
export type ValidationOutcome = "ok" | "missing" | "mismatch" | "not_applicable";
export type AccountType = "existing" | "new" | "unknown";

export interface OAuthFlowEvent {
  id: string;
  request_id: string;
  user_id: string | null;
  provider: string;
  account_type: AccountType;
  stage: OAuthStage;
  hop_index: number;
  source_url: string | null;
  destination_url: string | null;
  final_url: string | null;
  state_result: ValidationOutcome;
  nonce_result: ValidationOutcome;
  deviation: boolean;
  deviation_type: string | null;
  note: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

const STORAGE_KEY = "gradr-oauth-request-id";

/** Returns the active OAuth attempt without creating a new one. */
export function pendingRequestId(): string | null {
  try {
    return sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Stable id for the current sign-in attempt, shared across the redirect. */
export function currentRequestId(): string {
  try {
    const existing = sessionStorage.getItem(STORAGE_KEY);
    if (existing) return existing;
    const id = crypto.randomUUID();
    sessionStorage.setItem(STORAGE_KEY, id);
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

export function clearRequestId() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage disabled */
  }
}

let hop = 0;

export interface RecordArgs {
  stage: OAuthStage;
  sourceUrl?: string;
  destinationUrl?: string;
  finalUrl?: string;
  accountType?: AccountType;
  stateResult?: ValidationOutcome;
  nonceResult?: ValidationOutcome;
  deviationType?: string | null;
  note?: string;
  metadata?: Record<string, unknown>;
  provider?: string;
}

/** Classifies production-domain violations without exposing callback secrets. */
export function oauthDeviationType(urlValue: string | undefined, stage: OAuthStage): string | null {
  if (!urlValue) return null;
  try {
    const url = new URL(urlValue);
    if (url.hostname === "gradr.me" || url.hostname === "www.gradr.me") return "apex_domain_bounce";
    if (url.hostname !== "app.gradr.me") return null;
    if (stage === "callback" && url.pathname !== "/~oauth/callback" && url.pathname !== "/auth") {
      return "unexpected_callback_url";
    }
    if (stage === "session" && url.pathname !== "/dashboard") return "unexpected_final_url";
    return null;
  } catch {
    return "malformed_url";
  }
}

/** Is this final landing the production dashboard on the authenticated origin? */
export function isDeviation(finalUrl: string | undefined): boolean {
  return oauthDeviationType(finalUrl, "session") !== null;
}

/**
 * Writes one hop. Fire-and-forget: sign-in must never fail because telemetry
 * did. Values are redacted client-side and again by a database trigger.
 */
export async function recordOAuthHop(args: RecordArgs): Promise<void> {
  const inspectedUrl = args.finalUrl ?? args.destinationUrl;
  const derivedDeviation = oauthDeviationType(inspectedUrl, args.stage);
  const deviationType = args.deviationType ?? derivedDeviation;
  const deviation = Boolean(deviationType);
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    await supabase.from("oauth_flow_events").insert({
      request_id: currentRequestId(),
      user_id: sessionData.session?.user.id ?? null,
      provider: args.provider ?? "google",
      account_type: args.accountType ?? "unknown",
      stage: args.stage,
      hop_index: hop++,
      source_url: redactUrl(args.sourceUrl) || null,
      destination_url: redactUrl(args.destinationUrl) || null,
      final_url: redactUrl(args.finalUrl) || null,
      state_result: args.stateResult ?? "not_applicable",
      nonce_result: args.nonceResult ?? "not_applicable",
      deviation,
      deviation_type: deviationType,
      note: args.note ? redactUrl(args.note) : null,
      metadata: (redactMetadata(args.metadata ?? {}) ?? {}) as Record<string, never>,
    });

    if (deviationType) {
      captureError(new Error(`OAuth redirect deviation: ${deviationType}`), {
        request_id: currentRequestId(),
        stage: args.stage,
        deviation_type: deviationType,
        source_url: redactUrl(args.sourceUrl),
        destination_url: redactUrl(args.destinationUrl),
        final_url: redactUrl(args.finalUrl),
      });
    }
  } catch {
    /* never block auth on logging */
  }
}

/** Groups raw rows into per-request timelines, newest first. */
export interface OAuthTimeline {
  requestId: string;
  startedAt: string;
  endedAt: string;
  userId: string | null;
  accountType: AccountType;
  provider: string;
  hops: OAuthFlowEvent[];
  deviation: boolean;
  deviationTypes: string[];
  stateResult: ValidationOutcome;
  nonceResult: ValidationOutcome;
  finalUrl: string | null;
}

export function buildTimelines(rows: OAuthFlowEvent[]): OAuthTimeline[] {
  const byRequest = new Map<string, OAuthFlowEvent[]>();
  for (const row of rows) {
    const list = byRequest.get(row.request_id) ?? [];
    list.push(row);
    byRequest.set(row.request_id, list);
  }

  const worst = (values: ValidationOutcome[]): ValidationOutcome =>
    values.find((v) => v === "mismatch") ??
    values.find((v) => v === "missing") ??
    values.find((v) => v === "ok") ??
    "not_applicable";

  return [...byRequest.entries()]
    .map(([requestId, hops]) => {
      const ordered = [...hops].sort((a, b) => a.hop_index - b.hop_index);
      const last = ordered[ordered.length - 1];
      return {
        requestId,
        startedAt: ordered[0].created_at,
        endedAt: last.created_at,
        userId: ordered.find((h) => h.user_id)?.user_id ?? null,
        accountType: ordered.find((h) => h.account_type !== "unknown")?.account_type ?? "unknown",
        provider: ordered[0].provider,
        hops: ordered,
        deviation: ordered.some((h) => h.deviation),
        deviationTypes: [...new Set(ordered.map((h) => h.deviation_type).filter(Boolean) as string[])],
        stateResult: worst(ordered.map((h) => h.state_result)),
        nonceResult: worst(ordered.map((h) => h.nonce_result)),
        finalUrl: [...ordered].reverse().find((h) => h.final_url)?.final_url ?? null,
      } satisfies OAuthTimeline;
    })
    .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
}

/**
 * Host-mismatch detection for the auth callback.
 *
 * The provider issues its authorization code for the origin that started the
 * flow (app.gradr.me in production). If hosting bounces the browser to the
 * apex, the code arrives on a host that cannot exchange it — the user sees a
 * silent failure. This spots that case so the UI can explain it and offer a
 * one-click retry on the correct host.
 */
export interface OAuthHostMismatch {
  /** Host the callback actually landed on. */
  actualHost: string;
  /** Host the callback should have landed on. */
  expectedHost: string;
  /** Where to restart the sign-in so the code is issued for the right origin. */
  retryUrl: string;
}

export function detectOAuthHostMismatch(href: string): OAuthHostMismatch | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }

  // Only meaningful on the production domain family — previews and localhost
  // legitimately serve every surface from a single host.
  if (!/(^|\.)gradr\.me$/.test(url.hostname)) return null;

  const expected = new URL(PRODUCTION_APP_ORIGIN);
  if (url.hostname === expected.hostname) return null;

  const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
  const has = (key: string) => url.searchParams.has(key) || hash.has(key);
  const isOAuthLanding = has("code") || has("access_token") || has("state") || has("error");
  if (!isOAuthLanding) return null;

  const retry = new URL("/auth", PRODUCTION_APP_ORIGIN);
  const next = url.searchParams.get("next");
  if (next && next.startsWith("/") && !next.startsWith("//")) retry.searchParams.set("next", next);

  return { actualHost: url.hostname, expectedHost: expected.hostname, retryUrl: retry.toString() };
}
