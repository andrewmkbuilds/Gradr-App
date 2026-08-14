/**
 * Google OAuth flow forensics.
 *
 * Records each hop of a sign-in (initiate -> provider -> callback -> session)
 * so admins can reconstruct a redirect chain when Safe Browsing or a user
 * reports a suspicious flow. Everything is redacted before it leaves the tab.
 */
import { supabase } from "@/integrations/supabase/client";
import { redactMetadata, redactUrl } from "./redaction";

export const EXPECTED_FINAL_URL = "https://gradr.me/auth";

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

/** Is this landing URL the one we promised Google we would end on? */
export function isDeviation(finalUrl: string | undefined): boolean {
  if (!finalUrl) return false;
  try {
    const url = new URL(finalUrl);
    const expected = new URL(EXPECTED_FINAL_URL);
    // Any Gradr-owned host is fine in preview/dev; production must land on /auth.
    if (url.hostname === expected.hostname) return url.pathname !== expected.pathname;
    return false;
  } catch {
    return true;
  }
}

/**
 * Writes one hop. Fire-and-forget: sign-in must never fail because telemetry
 * did. Values are redacted client-side and again by a database trigger.
 */
export async function recordOAuthHop(args: RecordArgs): Promise<void> {
  const deviation = args.deviationType ? true : isDeviation(args.finalUrl);
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
      deviation_type: args.deviationType ?? (deviation ? "unexpected_final_url" : null),
      note: args.note ? redactUrl(args.note) : null,
      metadata: (redactMetadata(args.metadata ?? {}) ?? {}) as Record<string, never>,
    });
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
