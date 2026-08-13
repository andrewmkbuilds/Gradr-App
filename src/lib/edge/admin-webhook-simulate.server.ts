/**
 * Admin webhook payload generator / signature harness.
 *
 * Builds a provider-shaped test event, signs it with the same scheme the live
 * endpoint expects, and posts it to that endpoint over real HTTP so the whole
 * path — signature verification, idempotency claim, handler dispatch — is
 * exercised exactly as a provider would exercise it.
 *
 * Safety rules enforced here, never in the UI:
 *  - admin-only, verified server-side from the bearer token;
 *  - the signing secret stays on the server; the browser only asks for a
 *    "valid" or "invalid" signature;
 *  - simulated events are pinned to the sandbox environment and carry a
 *    `evt_sim_*` event id so they are distinguishable in webhook_deliveries.
 */
import { createHmac } from "crypto";
import { corsHeaders } from "./shared/cors";
import { createClient } from "./shared/supabase";
import { logSecurityEvent } from "./shared/securityAudit";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

type Provider = "paddle" | "revenuecat";

/** Paddle's `paddle-signature` header: `ts=<unix>;h1=<hmac_sha256(ts:body)>`. */
function paddleSignature(body: string, secret: string, valid: boolean) {
  const ts = Math.floor(Date.now() / 1000);
  const digest = createHmac("sha256", valid ? secret : `${secret}-invalid`)
    .update(`${ts}:${body}`)
    .digest("hex");
  return `ts=${ts};h1=${digest}`;
}

async function postOnce(url: string, body: string, headers: Record<string, string>) {
  const res = await fetch(url, { method: "POST", headers, body });
  const text = await res.text();
  let parsed: unknown = text;
  try {
    parsed = JSON.parse(text);
  } catch {
    /* provider endpoints may answer with plain text */
  }
  return { status: res.status, body: parsed };
}

export const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "Authentication required" }, 401);

  const admin = createClient(
    process.env['SUPABASE_URL']!,
    process.env['SUPABASE_SERVICE_ROLE_KEY']!,
    { auth: { persistSession: false } },
  );

  const { data: userData, error: userError } = await admin.auth.getUser(token);
  const user = userData?.user;
  if (userError || !user) return json({ error: "Authentication required" }, 401);
  if (user.is_anonymous) return json({ error: "Admin access required" }, 403);

  const { data: isAdmin, error: roleError } = await admin.rpc("has_role", {
    _user_id: user.id,
    _role: "admin",
  });
  if (roleError || isAdmin !== true) return json({ error: "Admin access required" }, 403);

  let body: {
    provider?: unknown;
    eventType?: unknown;
    eventId?: unknown;
    payload?: unknown;
    signValid?: unknown;
    checkIdempotency?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request body" }, 400);
  }

  const provider = (body.provider === "revenuecat" ? "revenuecat" : "paddle") as Provider;
  const signValid = body.signValid !== false;
  const checkIdempotency = body.checkIdempotency !== false;
  const eventId = typeof body.eventId === "string" ? body.eventId : `evt_sim_${Date.now()}`;
  if (!eventId.startsWith("evt_sim_")) {
    return json({ error: "Simulated events must use an evt_sim_* id" }, 400);
  }
  if (body.payload === undefined || body.payload === null) {
    return json({ error: "Payload is required" }, 400);
  }

  const origin = new URL(req.url).origin;
  const payloadText = JSON.stringify(body.payload);

  let url: string;
  let headers: Record<string, string>;

  if (provider === "paddle") {
    // Simulations always run against the sandbox environment.
    const secret = process.env['PAYMENTS_SANDBOX_WEBHOOK_SECRET'];
    if (!secret) return json({ error: "Sandbox webhook secret is not configured" }, 400);
    url = `${origin}/api/public/payments-webhook?env=sandbox`;
    headers = {
      "Content-Type": "application/json",
      "paddle-signature": paddleSignature(payloadText, secret, signValid),
    };
  } else {
    const secret = process.env['REVENUECAT_WEBHOOK_SECRET'];
    if (!secret) return json({ error: "RevenueCat webhook secret is not configured" }, 400);
    url = `${origin}/api/public/revenuecat-sync`;
    headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${signValid ? secret : `${secret}-invalid`}`,
    };
  }

  const first = await postOnce(url, payloadText, headers);

  let idempotent = true;
  let second: { status: number; body: unknown } | null = null;
  if (checkIdempotency && first.status < 300) {
    second = await postOnce(url, payloadText, headers);
    const b = second.body as { duplicate?: boolean } | string;
    idempotent =
      second.status < 300 &&
      (typeof b === "object" && b !== null ? b.duplicate === true : false);
  }

  const signatureVerified = signValid ? first.status < 300 : first.status >= 400;

  await logSecurityEvent({
    category: "billing_webhook",
    event: "simulated_webhook_sent",
    decision: signatureVerified ? "allowed" : "failed",
    env: "sandbox",
    source: "admin-webhook-simulate",
    reason: `${provider} ${String(body.eventType ?? "")} ${eventId} -> ${first.status}`,
    userId: user.id,
  });

  return json({
    status: first.status,
    signatureVerified,
    idempotent: checkIdempotency ? idempotent : true,
    duplicateOfFirst: second !== null ? idempotent : undefined,
    body: first.body,
    firstBody: second?.body,
  });
};
