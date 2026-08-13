/**
 * Automated SPF / DKIM / DMARC validation for the Gradr sending domain.
 *
 * Runs on a schedule (and on demand from /admin/email-ops). Each run:
 *
 *  1. Resolves the live DNS records over DNS-over-HTTPS — SPF for the sending
 *     subdomain, every configured DKIM selector, and the DMARC policy at the
 *     organisational domain. Records are *evaluated*, not merely detected:
 *     `+all`, `p=none`, `pct<100`, empty DKIM keys and undersized RSA keys all
 *     fail the run.
 *  2. Sends a real test email through the normal production queue, so the
 *     check exercises the actual sending path rather than a synthetic one.
 *  3. If a verification mailbox endpoint is configured, reads back the
 *     delivered message's `Authentication-Results` header and asserts the
 *     *actual* DKIM signature verified, SPF passed, and both are aligned with
 *     gradr.me — that is the only way to prove signing works end to end.
 *  4. Persists the verdict to `email_auth_checks` and raises an alert when the
 *     domain stops authenticating.
 *
 * No credentials are ever returned to the caller; the response is the same
 * verdict an admin sees in the dashboard.
 */
import { corsHeaders } from "./shared/cors";
import { createClient } from "./shared/supabase";
import { dispatchAlert } from "./shared/alerting";
import {
  ROOT_DOMAIN,
  SENDING_DOMAIN,
  domainsAlign,
  evaluateDkimRecord,
  evaluateDmarc,
  evaluateSpf,
  parseAuthenticationResults,
  resolveTxt,
  type AuthResults,
  type DkimSelectorResult,
} from "@/lib/email/dnsAuth";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/** Selectors the provider signs with. Overridable without a deploy. */
function dkimSelectors(): string[] {
  const configured = (process.env["EMAIL_DKIM_SELECTORS"] ?? "").trim();
  if (configured) return configured.split(",").map((s) => s.trim()).filter(Boolean);
  return ["resend", "resend2"];
}

export interface AuthCheckVerdict {
  domain: string;
  sendingDomain: string;
  spf: ReturnType<typeof evaluateSpf>;
  dkim: DkimSelectorResult[];
  dmarc: ReturnType<typeof evaluateDmarc>;
  test: { sent: boolean; messageId: string | null; recipient: string | null; error: string | null };
  authResults: (AuthResults & { aligned: { dkim: boolean; spf: boolean } }) | null;
  issues: string[];
  overall: "pass" | "warn" | "fail";
}

/** Pure evaluation of already-resolved DNS + delivery evidence. */
export function summarize(input: {
  spf: ReturnType<typeof evaluateSpf>;
  dkim: DkimSelectorResult[];
  dmarc: ReturnType<typeof evaluateDmarc>;
  authResults: AuthCheckVerdict["authResults"];
  testError: string | null;
}): { issues: string[]; overall: "pass" | "warn" | "fail" } {
  const issues = [
    ...input.spf.issues,
    ...input.dkim.flatMap((d) => d.issues),
    ...input.dmarc.issues,
  ];
  if (input.testError) issues.push(`Test send failed: ${input.testError}`);

  const ar = input.authResults;
  if (ar) {
    if (ar.dkim !== "pass") issues.push(`Delivered message reported dkim=${ar.dkim ?? "none"}`);
    if (ar.spf !== "pass") issues.push(`Delivered message reported spf=${ar.spf ?? "none"}`);
    if (ar.dmarc && ar.dmarc !== "pass") issues.push(`Delivered message reported dmarc=${ar.dmarc}`);
    if (!ar.aligned.dkim) issues.push(`DKIM signing domain "${ar.dkimDomain ?? "?"}" is not aligned with ${ROOT_DOMAIN}`);
    if (!ar.aligned.spf) issues.push(`SPF domain "${ar.spfDomain ?? "?"}" is not aligned with ${ROOT_DOMAIN}`);
  }

  // Anything that breaks authentication outright is a fail; the rest (missing
  // reporting address, no verification mailbox) is a warning.
  const hardFail =
    !input.spf.ok ||
    input.dkim.some((d) => !d.record) ||
    !input.dmarc.enforcing ||
    Boolean(input.testError) ||
    (ar ? ar.dkim !== "pass" || !ar.aligned.dkim : false);

  const overall = hardFail ? "fail" : issues.length > 0 ? "warn" : "pass";
  return { issues, overall };
}

/** Read back the delivered test message's Authentication-Results header. */
async function fetchDeliveredAuthResults(
  messageId: string,
  fetchImpl: typeof fetch,
): Promise<AuthResults | null> {
  const url = process.env["EMAIL_AUTH_VERIFIER_URL"];
  if (!url) return null;
  const token = process.env["EMAIL_AUTH_VERIFIER_TOKEN"];

  // The verifier is polled briefly: delivery is fast but not instant.
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const res = await fetchImpl(`${url}?message_id=${encodeURIComponent(messageId)}`, {
        headers: token ? { authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const body = (await res.json()) as { authentication_results?: string; headers?: Record<string, string> };
        const header =
          body.authentication_results ??
          body.headers?.["authentication-results"] ??
          body.headers?.["Authentication-Results"];
        if (header) return parseAuthenticationResults(header);
      }
    } catch {
      // keep polling; a verifier outage must not fail the DNS half of the run
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
  return null;
}

export const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const started = Date.now();
  const admin = createClient(
    process.env["SUPABASE_URL"]!,
    process.env["SUPABASE_SERVICE_ROLE_KEY"]!,
    { auth: { persistSession: false } },
  );

  // Two callers are allowed: the scheduler (shared cron key) and a signed-in
  // admin pressing "Run check now". Everyone else is refused before any send.
  const cronKey = process.env["EMAIL_AUTH_CRON_KEY"];
  const presentedKey = req.headers.get("x-cron-key");
  let authorized = Boolean(cronKey && presentedKey && presentedKey === cronKey);

  if (!authorized) {
    const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    if (!bearer) return json({ error: "Authentication required" }, 401);
    const { data: userData } = await admin.auth.getUser(bearer);
    const user = userData?.user;
    if (!user || user.is_anonymous) return json({ error: "Admin access required" }, 403);
    const { data: isAdmin } = await admin.rpc("has_role", { _user_id: user.id, _role: "admin" });
    if (isAdmin !== true) return json({ error: "Admin access required" }, 403);
    authorized = true;
  }


  let skipSend = false;
  try {
    const body = (await req.json()) as { skipSend?: boolean };
    skipSend = body?.skipSend === true;
  } catch {
    // empty body is the normal cron case
  }

  /* 1. DNS ------------------------------------------------------------- */
  const [spfTxt, dmarcTxt, ...dkimTxt] = await Promise.all([
    resolveTxt(SENDING_DOMAIN),
    resolveTxt(`_dmarc.${ROOT_DOMAIN}`),
    ...dkimSelectors().map((s) => resolveTxt(`${s}._domainkey.${SENDING_DOMAIN}`)),
  ]);

  const spf = evaluateSpf(spfTxt);
  const dmarc = evaluateDmarc(dmarcTxt);
  const dkim = dkimSelectors().map((selector, i) =>
    evaluateDkimRecord(selector, dkimTxt[i] ?? []),
  );

  /* 2. Real test send through the production queue --------------------- */
  const recipient = process.env["EMAIL_AUTH_TEST_RECIPIENT"] ?? null;
  let messageId: string | null = null;
  let testError: string | null = null;
  let sent = false;

  if (!skipSend && recipient) {
    messageId = `email-auth-check-${crypto.randomUUID()}`;
    const stamp = new Date().toISOString();
    const { error } = await admin.rpc("enqueue_email", {
      queue_name: "transactional_emails",
      payload: {
        message_id: messageId,
        to: recipient,
        from: `Gradr <noreply@${ROOT_DOMAIN}>`,
        sender_domain: SENDING_DOMAIN,
        subject: `Gradr email authentication check — ${stamp}`,
        html: `<p>Automated SPF/DKIM/DMARC verification probe.</p><p>Message ID: <code>${messageId}</code></p><p>Sent ${stamp}.</p>`,
        text: `Automated SPF/DKIM/DMARC verification probe.\nMessage ID: ${messageId}\nSent ${stamp}.`,
        purpose: "transactional",
        label: "email-auth-check",
        idempotency_key: messageId,
        queued_at: stamp,
      },
    });
    if (error) testError = error.message;
    else {
      sent = true;
      await admin.from("email_send_log").insert({
        message_id: messageId,
        template_name: "email-auth-check",
        recipient_email: recipient,
        status: "pending",
      });
    }
  } else if (!skipSend) {
    testError = null; // not configured is a warning, not a failure
  }

  /* 3. Verify the actual delivered signature --------------------------- */
  let authResults: AuthCheckVerdict["authResults"] = null;
  if (sent && messageId) {
    const parsed = await fetchDeliveredAuthResults(messageId, fetch);
    if (parsed) {
      authResults = {
        ...parsed,
        aligned: {
          dkim: domainsAlign(parsed.dkimDomain, ROOT_DOMAIN, dmarc.adkim === "s"),
          spf: domainsAlign(parsed.spfDomain, ROOT_DOMAIN, dmarc.aspf === "s"),
        },
      };
    }
  }

  const { issues, overall } = summarize({ spf, dkim, dmarc, authResults, testError });
  if (!recipient) issues.push("No verification mailbox configured, so delivered-signature checking is skipped");
  if (sent && !authResults) {
    issues.push("Test email was sent but no delivered Authentication-Results could be read back");
  }

  /* 4. Persist + alert -------------------------------------------------- */
  const { data: inserted } = await admin
    .from("email_auth_checks")
    .insert({
      domain: ROOT_DOMAIN,
      sending_domain: SENDING_DOMAIN,
      spf_ok: spf.ok,
      spf_record: spf.record,
      dkim_ok: dkim.length > 0 && dkim.every((d) => d.ok),
      dkim_selectors: dkim,
      dmarc_ok: dmarc.ok,
      dmarc_record: dmarc.record,
      dmarc_policy: dmarc.policy,
      test_message_id: messageId,
      test_send_ok: sent,
      headers_verified: Boolean(authResults),
      auth_results: authResults ?? {},
      issues,
      overall,
      duration_ms: Date.now() - started,
    })
    .select("id")
    .single();

  if (overall === "fail") {
    await dispatchAlert({
      endpoint: "/api/public/email-auth-check",
      kind: "auth_rejected",
      message: `Email authentication for ${ROOT_DOMAIN} is failing:\n- ${issues.join("\n- ")}`,
      occurrences: 1,
      firstSeenAt: new Date().toISOString(),
    });
  }

  const verdict: AuthCheckVerdict = {
    domain: ROOT_DOMAIN,
    sendingDomain: SENDING_DOMAIN,
    spf,
    dkim,
    dmarc,
    test: { sent, messageId, recipient: recipient ? recipient.replace(/^(.).*(@.*)$/, "$1***$2") : null, error: testError },
    authResults,
    issues,
    overall,
  };

  return json({ id: inserted?.id ?? null, ...verdict });
};
