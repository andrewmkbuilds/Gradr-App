import { createClient } from "npm:@supabase/supabase-js@2";
import { mapSheeridStatus } from "../_shared/eligibility.ts";
import { logSecurityEvent } from "../_shared/securityAudit.ts";

/**
 * Verification provider callback (SheerID today, any provider tomorrow).
 *
 * Public endpoint, so it is authenticated with a shared secret rather than a
 * user JWT: the provider must send `x-eligibility-secret` matching
 * ELIGIBILITY_WEBHOOK_SECRET. Without a configured secret the endpoint refuses
 * every request rather than trusting anonymous callers.
 */

function db() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

/** Constant-time-ish comparison to avoid leaking the secret via timing. */
function secretMatches(provided: string | null): boolean {
  const expected = Deno.env.get("ELIGIBILITY_WEBHOOK_SECRET");
  if (!expected || !provided || provided.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ provided.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  if (!secretMatches(req.headers.get("x-eligibility-secret"))) {
    await logSecurityEvent({
      category: "eligibility",
      event: "webhook_rejected",
      decision: "denied",
      source: "eligibility-webhook",
      reason: "bad_or_missing_secret",
    });
    return new Response("Unauthorized", { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  // SheerID sends `verificationId` and the tracking id we supplied.
  const reference = String(
    payload.trackingId ?? payload.verificationId ?? payload.reference_id ?? "",
  ).trim();
  if (!reference) return new Response("Missing reference", { status: 400 });

  // The reference is always an opaque id (our row UUID, or the provider's
  // verification id). Reject anything containing filter syntax or unexpected
  // characters before it reaches a query.
  if (reference.length > 100 || !/^[A-Za-z0-9._:-]+$/.test(reference)) {
    return new Response("Invalid reference", { status: 400 });
  }
  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(reference);

  const status = mapSheeridStatus(
    payload.currentStep as string | undefined,
    (payload.status ?? payload.segment) as string | undefined,
  );

  const supabase = db();

  // The tracking id we hand the provider IS our verification row id. Look it up
  // with parameterized equality filters instead of a concatenated .or() string.
  const columns = "id, user_id, eligibility_type, status";
  let row: { id: string; user_id: string; eligibility_type: string; status: string } | null = null;

  if (isUuid) {
    const { data } = await supabase
      .from("eligibility_verifications")
      .select(columns)
      .eq("id", reference)
      .maybeSingle();
    row = data ?? null;
  }

  if (!row) {
    const { data } = await supabase
      .from("eligibility_verifications")
      .select(columns)
      .eq("provider_reference_id", reference)
      .maybeSingle();
    row = data ?? null;
  }

  if (!row) return new Response("Unknown verification", { status: 404 });

  const { data: category } = await supabase
    .from("eligibility_categories")
    .select("verification_validity_days, label")
    .eq("key", row.eligibility_type)
    .maybeSingle();

  const validity = Number(category?.verification_validity_days ?? 365);
  const now = new Date();

  await supabase
    .from("eligibility_verifications")
    .update({
      status,
      provider_reference_id: reference,
      verified_at: status === "verified" ? now.toISOString() : null,
      expires_at: status === "verified"
        ? new Date(now.getTime() + validity * 86_400_000).toISOString()
        : null,
      failure_reason: status === "failed"
        ? String(payload.errorIds ?? payload.reason ?? "Verification was not approved").slice(0, 300)
        : null,
      last_checked_at: now.toISOString(),
    })
    .eq("id", row.id);

  if (status !== row.status) {
    const { data: settings } = await supabase
      .from("discount_settings")
      .select("notify_verified, notify_failed")
      .eq("id", 1)
      .maybeSingle();

    const shouldNotify = status === "verified"
      ? settings?.notify_verified !== false
      : status === "failed"
        ? settings?.notify_failed !== false
        : false;

    if (shouldNotify) {
      await supabase.rpc("enqueue_notification", {
        _user_id: row.user_id,
        _type: `eligibility_${status}`,
        _title: status === "verified"
          ? `${category?.label ?? "Eligibility"} verified`
          : "We couldn't verify your eligibility",
        _body: status === "verified"
          ? "Your discount is now active. It will be applied automatically at checkout."
          : "You can try again with different details from your eligibility settings.",
        _link: "/settings?tab=eligibility",
        _metadata: { verification_id: row.id, status },
      });
    }
  }

  await logSecurityEvent({
    category: "eligibility",
    event: "webhook_processed",
    decision: "processed",
    userId: row.user_id as string,
    source: "eligibility-webhook",
    details: { verification_id: row.id, status, eligibility_type: row.eligibility_type },
  });

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
