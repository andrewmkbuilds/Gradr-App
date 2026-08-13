/**
 * DMARC aggregate report ingestion.
 *
 * Mailbox providers (Google, Microsoft, Yahoo, Comcast…) post a daily XML
 * report to the `rua=` address in the gradr.me DMARC record. A forwarder
 * (mail hook or manual upload from /admin/email-ops) delivers the report body
 * here; this endpoint parses it and stores the aggregate plus every per-source
 * row so alignment can be audited over time.
 *
 * Accepted bodies:
 *   - `application/xml` / `text/xml` — raw report
 *   - `application/gzip` — gzipped report (`.xml.gz`, what providers attach)
 *   - `application/json` with `{ filename, contentBase64 }`
 *
 * Reports are idempotent on (org_name, external_report_id): re-posting the same
 * report replaces it rather than double-counting the volume.
 */
import { corsHeaders } from "./shared/cors";
import { createClient } from "./shared/supabase";
import { decodeReportPayload, parseDmarcXml, type DmarcReport } from "@/lib/email/dmarcReport";
import { ROOT_DOMAIN } from "@/lib/email/dnsAuth";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.includes(",") ? b64.slice(b64.indexOf(",") + 1) : b64;
  const binary = atob(clean.replace(/\s+/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const admin = createClient(
    process.env["SUPABASE_URL"]!,
    process.env["SUPABASE_SERVICE_ROLE_KEY"]!,
    { auth: { persistSession: false } },
  );

  /* Auth: shared forwarder token, or a signed-in admin uploading by hand. */
  const ingestToken = process.env["DMARC_INGEST_TOKEN"];
  const presented = req.headers.get("x-dmarc-token");
  let source = "forwarder";
  let authorized = Boolean(ingestToken && presented && presented === ingestToken);

  if (!authorized) {
    const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    if (!bearer) return json({ error: "Authentication required" }, 401);
    const { data: userData } = await admin.auth.getUser(bearer);
    const user = userData?.user;
    if (!user || user.is_anonymous) return json({ error: "Admin access required" }, 403);
    const { data: isAdmin } = await admin.rpc("has_role", { _user_id: user.id, _role: "admin" });
    if (isAdmin !== true) return json({ error: "Admin access required" }, 403);
    authorized = true;
    source = "manual";
  }

  /* Decode whatever shape the report arrived in. */
  const contentType = (req.headers.get("content-type") ?? "").toLowerCase();
  let xml: string;
  try {
    if (contentType.includes("application/json")) {
      const body = (await req.json()) as { contentBase64?: string; xml?: string };
      if (body.xml) xml = body.xml;
      else if (body.contentBase64) xml = await decodeReportPayload(base64ToBytes(body.contentBase64));
      else return json({ error: "Provide `xml` or `contentBase64`" }, 400);
    } else {
      xml = await decodeReportPayload(new Uint8Array(await req.arrayBuffer()));
    }
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Could not read report" }, 400);
  }

  let report: DmarcReport;
  try {
    report = parseDmarcXml(xml);
  } catch {
    return json({ error: "Report is not a valid DMARC aggregate document" }, 400);
  }

  if (!report.policyDomain || !report.policyDomain.endsWith(ROOT_DOMAIN)) {
    return json(
      { error: `Report is for "${report.policyDomain || "an unknown domain"}", not ${ROOT_DOMAIN}` },
      422,
    );
  }

  /* Replace any earlier copy of the same report, then insert. */
  await admin
    .from("dmarc_reports")
    .delete()
    .eq("org_name", report.orgName)
    .eq("external_report_id", report.reportId);

  const { data: inserted, error: insertError } = await admin
    .from("dmarc_reports")
    .insert({
      org_name: report.orgName,
      org_email: report.orgEmail,
      external_report_id: report.reportId,
      date_begin: report.dateBegin,
      date_end: report.dateEnd,
      policy_domain: report.policyDomain,
      policy_p: report.policyP,
      policy_sp: report.policySp,
      policy_pct: report.policyPct,
      policy_adkim: report.policyAdkim,
      policy_aspf: report.policyAspf,
      total_messages: report.totalMessages,
      pass_messages: report.passMessages,
      fail_messages: report.failMessages,
      source,
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    return json({ error: insertError?.message ?? "Could not store report" }, 500);
  }

  if (report.records.length > 0) {
    const { error: recordError } = await admin.from("dmarc_report_records").insert(
      report.records.map((r) => ({
        report_id: inserted.id,
        source_ip: r.sourceIp,
        message_count: r.count,
        disposition: r.disposition,
        dkim_result: r.dkimResult,
        spf_result: r.spfResult,
        header_from: r.headerFrom,
        envelope_from: r.envelopeFrom,
        dkim_domain: r.dkimDomain,
        dkim_selector: r.dkimSelector,
        spf_domain: r.spfDomain,
        aligned: r.aligned,
      })),
    );
    if (recordError) return json({ error: recordError.message }, 500);
  }

  return json({
    id: inserted.id,
    orgName: report.orgName,
    reportId: report.reportId,
    range: { begin: report.dateBegin, end: report.dateEnd },
    policy: { p: report.policyP, pct: report.policyPct, adkim: report.policyAdkim, aspf: report.policyAspf },
    totals: {
      messages: report.totalMessages,
      pass: report.passMessages,
      fail: report.failMessages,
      passRate: report.totalMessages ? report.passMessages / report.totalMessages : null,
    },
    records: report.records.length,
  });
};
