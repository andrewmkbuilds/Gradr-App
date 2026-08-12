import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { providerFor, sheeridProvider } from "../_shared/eligibility.ts";
import { logSecurityEvent } from "../_shared/securityAudit.ts";

/**
 * Starts (or refreshes) an eligibility verification for the signed-in user.
 *
 * The client can only ask for a category — it can never set a status, a
 * percentage, or another user's record. All writes happen here with the
 * service role.
 */

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function admin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

  const authed = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: claims, error: claimsError } = await authed.auth.getClaims(
    authHeader.replace("Bearer ", ""),
  );
  if (claimsError || !claims?.claims?.sub) return json({ error: "Unauthorized" }, 401);

  const userId = claims.claims.sub as string;
  const email = (claims.claims.email as string | undefined) ?? null;

  let body: { action?: string; eligibilityType?: string; locale?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const action = body.action ?? "start";
  const eligibilityType = String(body.eligibilityType ?? "").trim();
  if (!eligibilityType || eligibilityType.length > 64) {
    return json({ error: "eligibilityType is required" }, 400);
  }

  const db = admin();

  const { data: category } = await db
    .from("eligibility_categories")
    .select("key, label, active, self_serve, verification_validity_days")
    .eq("key", eligibilityType)
    .maybeSingle();

  if (!category || !category.active) {
    return json({ error: "This eligibility category is not available." }, 400);
  }

  const { data: existing } = await db
    .from("eligibility_verifications")
    .select("id, status, provider, provider_reference_id, expires_at")
    .eq("user_id", userId)
    .eq("eligibility_type", eligibilityType)
    .maybeSingle();

  // Refresh: re-read the provider's decision for an in-flight verification.
  if (action === "refresh") {
    if (!existing) return json({ error: "No verification to refresh." }, 404);
    if (existing.provider !== "sheerid" || !existing.provider_reference_id) {
      return json({ status: existing.status });
    }
    const result = await sheeridProvider.check!(existing.provider_reference_id as string);
    if (result.status !== existing.status) {
      const validity = Number(category.verification_validity_days ?? 365);
      await db
        .from("eligibility_verifications")
        .update({
          status: result.status,
          verified_at: result.status === "verified" ? new Date().toISOString() : null,
          expires_at: result.status === "verified"
            ? new Date(Date.now() + validity * 86_400_000).toISOString()
            : null,
          failure_reason: result.reason ?? null,
          last_checked_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
    }
    return json({ status: result.status });
  }

  // Already verified and still valid — nothing to do.
  if (
    existing?.status === "verified" &&
    (!existing.expires_at || new Date(existing.expires_at as string) > new Date())
  ) {
    return json({ status: "verified", alreadyVerified: true });
  }

  const { data: upserted, error: upsertError } = await db
    .from("eligibility_verifications")
    .upsert(
      {
        user_id: userId,
        eligibility_type: eligibilityType,
        provider: "pending",
        status: "pending",
        failure_reason: null,
        verified_at: null,
        expires_at: null,
        last_checked_at: new Date().toISOString(),
      },
      { onConflict: "user_id,eligibility_type" },
    )
    .select("id")
    .single();

  if (upsertError || !upserted) {
    console.error("verify-eligibility upsert failed", upsertError?.message);
    return json({ error: "Could not start verification." }, 500);
  }

  const provider = category.self_serve ? providerFor(eligibilityType) : providerFor("__manual__");

  try {
    const started = await provider.start({
      eligibilityType,
      verificationId: upserted.id as string,
      email,
      locale: body.locale ?? null,
    });

    await db
      .from("eligibility_verifications")
      .update({
        provider: started.provider,
        provider_reference_id: started.referenceId,
        status: started.status,
      })
      .eq("id", upserted.id);

    await logSecurityEvent({
      category: "eligibility",
      event: "verification_started",
      decision: "allowed",
      userId,
      source: "verify-eligibility",
      details: { eligibility_type: eligibilityType, provider: started.provider },
    });

    return json({
      verificationId: upserted.id,
      status: started.status,
      provider: started.provider,
      verificationUrl: started.verificationUrl,
    });
  } catch (e) {
    console.error("verify-eligibility start failed", e);
    await db
      .from("eligibility_verifications")
      .update({ provider: "manual", status: "manual_review" })
      .eq("id", upserted.id);
    return json({
      verificationId: upserted.id,
      status: "manual_review",
      provider: "manual",
      verificationUrl: null,
    });
  }
});
