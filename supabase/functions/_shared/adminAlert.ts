/**
 * Shared admin alert fan-out (extracted from payments-watchdog).
 *
 * Raises an alert once per dedupe key: persists to billing_alerts, notifies
 * admins in-app, emails ALERT_EMAIL_TO, and posts to ALERT_SLACK_WEBHOOK_URL.
 * Re-raises with a fresh dedupe key (e.g. include the date) to alert again.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { formatDate, sendTransactionalEmail } from "./sendTransactional.ts";

export async function raiseAdminAlert(params: {
  alertType: string;
  severity: "warning" | "critical";
  subject: string;
  dedupeKey: string;
  details: Record<string, unknown>;
  link?: string;
}): Promise<boolean> {
  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
  const environment = Deno.env.get("APP_ENV") || "production";

  const { data: existing } = await db
    .from("billing_alerts")
    .select("id, notified_at")
    .eq("dedupe_key", params.dedupeKey)
    .maybeSingle();

  await db.from("billing_alerts").upsert(
    {
      ...(existing ? { id: existing.id } : {}),
      alert_type: params.alertType,
      severity: params.severity,
      environment,
      subject: params.subject,
      dedupe_key: params.dedupeKey,
      details: params.details,
      notified_at: existing?.notified_at ?? new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "dedupe_key" },
  );

  // Already told the team about this exact problem — don't spam.
  if (existing?.notified_at) return false;

  await db.rpc("notify_admins", {
    _type: params.alertType,
    _title: params.subject,
    _body: `${params.severity.toUpperCase()} · ${params.alertType} (${environment})`,
    _link: params.link ?? "/admin/webhook-logs",
    _metadata: params.details,
  });

  const alertEmail = Deno.env.get("ALERT_EMAIL_TO");
  if (alertEmail) {
    await sendTransactionalEmail({
      templateName: "security-alert",
      recipientEmail: alertEmail,
      idempotencyKey: `admin-alert-${params.dedupeKey}`,
      templateData: {
        alertType: params.alertType,
        headline: params.subject,
        detail: JSON.stringify(params.details).slice(0, 800),
        occurredAt: formatDate(new Date().toISOString()),
      },
    });
  }

  const slack = Deno.env.get("ALERT_SLACK_WEBHOOK_URL");
  if (slack) {
    await fetch(slack, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: `:rotating_light: *${params.subject}*\n${params.alertType} · ${environment}\n\`\`\`${
          JSON.stringify(params.details).slice(0, 800)
        }\`\`\``,
      }),
    }).catch((err) => console.error("slack alert failed", String(err)));
  }
  return true;
}
