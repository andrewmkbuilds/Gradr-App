import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { connectorConfigured, gatewayFetch } from "../_shared/gateway.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const FROM = Deno.env.get("NOTIFICATION_FROM_EMAIL") || "Gradr <onboarding@resend.dev>";
const APP_URL = Deno.env.get("APP_PUBLIC_URL") || "https://gradr.me";

const escape = (v: unknown) =>
  String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function emailHtml(docTitle: string, version: number, effective: string, summary: string, link: string) {
  return `<!doctype html><html><body style="margin:0;background:#0b1020;padding:32px 0;font-family:Inter,Segoe UI,Helvetica,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#111a33;border:1px solid #1e2b4d;border-radius:16px;padding:32px">
      <tr><td style="color:#7dd3fc;font-size:13px;letter-spacing:.14em;text-transform:uppercase;padding-bottom:12px">Gradr</td></tr>
      <tr><td style="color:#f8fafc;font-size:22px;font-weight:600;padding-bottom:12px">We've updated our ${escape(docTitle)}</td></tr>
      <tr><td style="color:#c3ccdd;font-size:15px;line-height:1.6;padding-bottom:16px">
        Version ${version} takes effect on ${escape(effective)}. Please review the changes — you'll be asked to accept them the next time you open Gradr.
      </td></tr>
      ${summary ? `<tr><td style="color:#c3ccdd;font-size:14px;line-height:1.6;background:#0d1730;border:1px solid #1e2b4d;border-radius:10px;padding:14px;margin-bottom:16px"><strong style="color:#f8fafc">What changed</strong><br/>${escape(summary)}</td></tr><tr><td style="height:20px"></td></tr>` : ""}
      <tr><td><a href="${link}" style="display:inline-block;background:#22d3ee;color:#06121f;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:10px">Review the update</a></td></tr>
      <tr><td style="color:#64748b;font-size:12px;padding-top:28px">This is a required service notice about your Gradr account.</td></tr>
    </table>
  </td></tr></table></body></html>`;
}

/**
 * Emails every user who has not yet accepted a published legal document
 * version. Admin-only; sends through the Resend connector.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;

    const caller = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await caller.auth.getUser();
    const user = userData?.user;
    if (!user) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: isAdmin } = await admin.rpc("has_role", { _user_id: user.id, _role: "admin" });
    if (!isAdmin) return json({ error: "Forbidden" }, 403);

    const { document_id } = await req.json().catch(() => ({}));
    if (!document_id) return json({ error: "document_id is required" }, 400);

    const { data: doc } = await admin
      .from("legal_documents")
      .select("id,title,version,status,effective_date,summary_of_changes,doc_type")
      .eq("id", document_id)
      .maybeSingle();
    if (!doc || doc.status !== "published") return json({ error: "Document is not published" }, 400);

    if (!connectorConfigured("RESEND_API_KEY")) {
      return json({ error: "Email is not configured" }, 400);
    }

    // Users who have not accepted this version yet.
    const { data: accepted } = await admin
      .from("legal_acceptances")
      .select("user_id")
      .eq("document_id", doc.id);
    const acceptedIds = new Set((accepted ?? []).map((a: { user_id: string }) => a.user_id));

    const recipients: { id: string; email: string }[] = [];
    let page = 1;
    while (page <= 20) {
      const { data: listed, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) break;
      const users = listed?.users ?? [];
      for (const u of users) {
        if (u.email && !u.is_anonymous && !acceptedIds.has(u.id)) {
          recipients.push({ id: u.id, email: u.email });
        }
      }
      if (users.length < 200) break;
      page += 1;
    }

    const link = `${APP_URL}${doc.doc_type === "terms" ? "/terms" : "/privacy"}`;
    const subject =
      doc.doc_type === "privacy"
        ? "Gradr Privacy Policy Update - Please Review"
        : "Gradr Terms & Conditions Update - Please Review";
    const html = emailHtml(doc.title, doc.version, doc.effective_date, doc.summary_of_changes ?? "", link);

    let sent = 0;
    let failed = 0;
    for (const r of recipients) {
      const idempotency = `legal:${doc.id}:${r.id}`;
      const { data: already } = await admin
        .from("email_notification_log")
        .select("id")
        .eq("idempotency_key", idempotency)
        .maybeSingle();
      if (already) continue;

      let status = "sent";
      let providerId: string | null = null;
      let errorMessage: string | null = null;
      try {
        const res = await gatewayFetch("resend", "RESEND_API_KEY", "/emails", {
          method: "POST",
          body: JSON.stringify({ from: FROM, to: [r.email], subject, html }),
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
          status = "failed";
          errorMessage = JSON.stringify(payload).slice(0, 400);
          failed += 1;
        } else {
          providerId = payload?.id ?? null;
          sent += 1;
        }
      } catch (e) {
        status = "failed";
        errorMessage = String(e).slice(0, 400);
        failed += 1;
      }

      await admin.from("email_notification_log").insert({
        user_id: r.id,
        template: "legal_policy_update",
        recipient: r.email,
        subject,
        idempotency_key: idempotency,
        status,
        provider_message_id: providerId,
        error: errorMessage,
        metadata: { document_id: doc.id, doc_type: doc.doc_type, version: doc.version },
      });
    }

    return json({ sent, failed, recipients: recipients.length });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
