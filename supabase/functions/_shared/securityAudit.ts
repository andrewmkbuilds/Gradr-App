/**
 * Security audit trail.
 *
 * Records three classes of security-relevant decisions so they can be reviewed
 * later per user: billing webhook events, entitlement checks, and AI-call
 * authorization outcomes. Writes go through the service role and are never
 * allowed to break the request they describe.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

export type SecurityCategory =
  | "billing_webhook"
  | "entitlement_check"
  | "ai_authorization"
  | "eligibility"
  | "discount";
export type SecurityDecision = "allowed" | "denied" | "received" | "processed" | "failed";

export interface SecurityEvent {
  category: SecurityCategory;
  event: string;
  decision: SecurityDecision;
  userId?: string | null;
  feature?: string | null;
  env?: string | null;
  reason?: string | null;
  source?: string | null;
  details?: Record<string, unknown>;
}

let _client: ReturnType<typeof createClient> | null = null;
function db() {
  if (!_client) {
    _client = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );
  }
  return _client;
}

export async function logSecurityEvent(e: SecurityEvent): Promise<void> {
  try {
    const { error } = await db().from("security_audit_log").insert({
      category: e.category,
      event: e.event,
      decision: e.decision,
      user_id: e.userId ?? null,
      feature: e.feature ?? null,
      environment: e.env ?? null,
      reason: e.reason ?? null,
      source: e.source ?? null,
      details: e.details ?? {},
    });
    if (error) console.warn("[security-audit] insert failed", error.message);
  } catch (err) {
    console.warn("[security-audit] insert threw", err);
  }
}

/** Convenience wrapper for AI endpoints: one line per authorization outcome. */
export function logAiAuthorization(params: {
  source: string;
  decision: SecurityDecision;
  userId?: string | null;
  feature?: string | null;
  env?: string | null;
  reason?: string | null;
  details?: Record<string, unknown>;
}) {
  return logSecurityEvent({
    category: "ai_authorization",
    event: params.source,
    decision: params.decision,
    userId: params.userId,
    feature: params.feature,
    env: params.env,
    reason: params.reason,
    source: params.source,
    details: params.details,
  });
}
