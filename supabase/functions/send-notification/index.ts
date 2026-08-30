import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { connectorConfigured, gatewayFetch, GatewayError } from "../_shared/gateway.ts";
import { raiseAdminAlert } from "../_shared/adminAlert.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const FROM = Deno.env.get("NOTIFICATION_FROM_EMAIL") || "Gradr <onboarding@resend.dev>";
const APP_URL = Deno.env.get("APP_PUBLIC_URL") || "https://gradr.me";

type TemplateId =
  | "interview_scheduled"
  | "interview_reminder"
  | "interview_followup"
  | "application_submitted"
  | "job_matches_ready";

interface TemplateInput {
  name?: string;
  title?: string;
  company?: string;
  role?: string;
  whenLabel?: string;
  count?: number;
  link?: string;
}

const escape = (v: unknown) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

function shell(heading: string, body: string, ctaLabel: string, ctaHref: string) {
  return `<!doctype html><html><body style="margin:0;background:#0b1020;padding:32px 0;font-family:Inter,Segoe UI,Helvetica,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#111a33;border:1px solid #1e2b4d;border-radius:16px;padding:32px">
      <tr><td style="color:#7dd3fc;font-size:13px;letter-spacing:.14em;text-transform:uppercase;padding-bottom:12px">Gradr</td></tr>
      <tr><td style="color:#f8fafc;font-size:22px;font-weight:600;padding-bottom:12px">${heading}</td></tr>
      <tr><td style="color:#c3ccdd;font-size:15px;line-height:1.6;padding-bottom:24px">${body}</td></tr>
      <tr><td><a href="${ctaHref}" style="display:inline-block;background:#22d3ee;color:#06121f;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:10px">${ctaLabel}</a></td></tr>
      <tr><td style="color:#64748b;font-size:12px;padding-top:28px">You can turn these emails off in Gradr → Settings → Notifications.</td></tr>
    </table>
  </td></tr></table></body></html>`;
}

function render(template: TemplateId, input: TemplateInput): { subject: string; html: string } | null {
  const who = escape(input.name || "there");
  const link = input.link?.startsWith("http") ? input.link : `${APP_URL}${input.link || "/dashboard"}`;

  switch (template) {
    case "interview_scheduled":
      return {
        subject: `Interview scheduled: ${input.title || "Mock interview"}`,
        html: shell(
          "Your interview is on the calendar",
          `Hi ${who}, <strong>${escape(input.title)}</strong>${input.company ? ` at ${escape(input.company)}` : ""} is set for <strong>${escape(input.whenLabel)}</strong>. We'll remind you an hour before.`,
          "Open Interview Studio",
          link,
        ),
      };
    case "interview_reminder":
      return {
        subject: `Starting soon: ${input.title || "Interview"}`,
        html: shell(
          "Time to warm up",
          `<strong>${escape(input.title)}</strong> starts ${escape(input.whenLabel)}. Run a 5-minute warm-up round so you walk in already in rhythm.`,
          "Start a warm-up",
          link,
        ),
      };
    case "interview_followup":
      return {
        subject: `Your follow-up plan for ${input.role || "the interview"}`,
        html: shell(
          "Turn that session into progress",
          `Your scorecard and a personalised 7-day practice plan are ready${input.role ? ` for <strong>${escape(input.role)}</strong>` : ""}.`,
          "View my plan",
          link,
        ),
      };
    case "application_submitted":
      return {
        subject: `Application tracked: ${input.role || "New role"}`,
        html: shell(
          "Application saved",
          `We're tracking <strong>${escape(input.role)}</strong>${input.company ? ` at ${escape(input.company)}` : ""}. Gradr will nudge you when it's time to follow up.`,
          "Open tracker",
          link,
        ),
      };
    case "job_matches_ready":
      return {
        subject: `${input.count ?? 0} new matches for you`,
        html: shell(
          "Fresh matches are in",
          `We found <strong>${escape(input.count ?? 0)}</strong> new roles that fit your target profile.`,
          "See matches",
          link,
        ),
      };
    default:
      return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    const cronSecret = req.headers.get("x-cron-secret");
    const isSystem = Boolean(cronSecret && cronSecret === Deno.env.get("CRON_SECRET"));

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let userId: string | null = null;
    let email: string | null = null;

    if (!isSystem) {
      if (!authHeader) return json({ error: "Unauthorized", code: "unauthorized" }, 401);
      const scoped = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user }, error } = await scoped.auth.getUser();
      if (error || !user) return json({ error: "Unauthorized", code: "unauthorized" }, 401);
      userId = user.id;
      email = user.email ?? null;
    }

    const body = await req.json().catch(() => ({}));
    const template = body.template as TemplateId;
    const input = (body.input ?? {}) as TemplateInput;

    // System callers may target another user; signed-in callers may only email themselves.
    if (isSystem) {
      userId = typeof body.userId === "string" ? body.userId : null;
      if (!userId) return json({ error: "userId is required", code: "invalid_input" }, 400);
      const { data } = await admin.auth.admin.getUserById(userId);
      email = data?.user?.email ?? null;
    }

    if (!email) return json({ error: "No email address on file", code: "no_recipient" }, 400);

    const rendered = render(template, input);
    if (!rendered) return json({ error: "Unknown template", code: "invalid_input" }, 400);

    if (!connectorConfigured("RESEND_API_KEY")) {
      return json({ error: "Email sending is not configured yet.", code: "not_configured" }, 503);
    }

    const idempotencyKey =
      typeof body.idempotencyKey === "string" && body.idempotencyKey.length > 0
        ? body.idempotencyKey.slice(0, 200)
        : `${userId}:${template}:${new Date().toISOString().slice(0, 13)}`;

    const { data: existing } = await admin
      .from("email_notification_log")
      .select("id")
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    if (existing) return json({ ok: true, deduped: true });

    try {
      const res = await gatewayFetch("resend", "RESEND_API_KEY", "/emails", {
        method: "POST",
        body: JSON.stringify({
          from: FROM,
          to: [email],
          subject: rendered.subject,
          html: rendered.html,
        }),
      });
      const sent = await res.json();

      await admin.from("email_notification_log").insert({
        user_id: userId,
        template,
        recipient: email,
        subject: rendered.subject,
        idempotency_key: idempotencyKey,
        status: "sent",
        provider_message_id: sent?.id ?? null,
        metadata: { template_input_keys: Object.keys(input) },
      });

      return json({ ok: true, id: sent?.id ?? null });
    } catch (e) {
      const status = e instanceof GatewayError ? e.status : 500;
      const detail = e instanceof GatewayError ? e.body : String(e);
      await admin.from("email_notification_log").insert({
        user_id: userId,
        template,
        recipient: email,
        subject: rendered.subject,
        idempotency_key: idempotencyKey,
        status: "failed",
        error: detail.slice(0, 500),
      });
      // A provider rejection means no user gets mail (e.g. unverified sender
      // domain). Surface it to admins instead of burying it in function logs.
      await raiseAdminAlert({
        alertType: "email_provider_rejected",
        severity: "critical",
        subject: "Email provider rejected an outgoing message",
        dedupeKey: `email-provider-${status}-${new Date().toISOString().slice(0, 10)}`,
        details: { function: "send-notification", template, status, detail: detail.slice(0, 500) },
        link: "/admin/email-logs",
      }).catch((err) => console.error("alert fan-out failed", String(err)));
      return json({ error: "Email provider request failed", status, details: detail }, status);

    }
  } catch (e) {
    console.error("send-notification error:", e);
    return json({ error: "Unexpected error", details: String(e) }, 500);
  }
});
