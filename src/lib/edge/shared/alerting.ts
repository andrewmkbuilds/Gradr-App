/**
 * Outbound alerting for API health incidents.
 *
 * An alert row in `api_health_alerts` is only useful if somebody sees it, so a
 * newly opened alert is announced to Slack and/or email. Delivery is
 * best-effort and never allowed to affect the request that triggered it.
 *
 * Noise control: an incident is announced once when it opens, then again only
 * when it crosses an escalation threshold, so a flapping endpoint cannot spam
 * the channel.
 */
import { sendLovableEmail } from "@lovable.dev/email-js";

const ESCALATION_THRESHOLDS = [25, 100, 500];

export interface AlertNotice {
  endpoint: string;
  kind: string;
  message: string;
  occurrences: number;
  firstSeenAt: string;
}

const KIND_LABEL: Record<string, string> = {
  auth_rejected: "Authentication rejected",
  rate_limited: "Rate limited",
  server_error: "Endpoint failing",
  client_error: "Client errors",
};

/** True when this occurrence count is worth announcing again. */
export function shouldEscalate(occurrences: number): boolean {
  return ESCALATION_THRESHOLDS.includes(occurrences);
}

export function alertingTargets(): { slack: boolean; email: boolean } {
  return {
    slack: Boolean(process.env['ALERT_SLACK_WEBHOOK_URL']),
    email: Boolean(process.env['ALERT_EMAIL_TO']),
  };
}

async function postToSlack(notice: AlertNotice, isEscalation: boolean): Promise<void> {
  const url = process.env['ALERT_SLACK_WEBHOOK_URL'];
  if (!url) return;

  const title = isEscalation
    ? `:rotating_light: Gradr API incident escalating — ${notice.endpoint}`
    : `:warning: Gradr API alert — ${notice.endpoint}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: title,
      blocks: [
        { type: "header", text: { type: "plain_text", text: title.replace(/:[a-z_]+:\s*/, "") } },
        {
          type: "section",
          fields: [
            { type: "mrkdwn", text: `*Endpoint*\n\`${notice.endpoint}\`` },
            { type: "mrkdwn", text: `*Type*\n${KIND_LABEL[notice.kind] ?? notice.kind}` },
            { type: "mrkdwn", text: `*Occurrences*\n${notice.occurrences}` },
            { type: "mrkdwn", text: `*First seen*\n${new Date(notice.firstSeenAt).toUTCString()}` },
          ],
        },
        { type: "section", text: { type: "mrkdwn", text: `*Latest error*\n\`\`\`${notice.message.slice(0, 500)}\`\`\`` } },
      ],
    }),
  });

  if (!res.ok) throw new Error(`Slack responded ${res.status}`);
}

async function sendAlertEmail(notice: AlertNotice, isEscalation: boolean): Promise<void> {
  const to = process.env['ALERT_EMAIL_TO'];
  if (!to) return;

  const subject = isEscalation
    ? `[Gradr] Escalating: ${notice.endpoint} (${notice.occurrences} failures)`
    : `[Gradr] API alert: ${notice.endpoint}`;

  await sendLovableEmail({
    to,
    subject,
    html: `
      <div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:560px">
        <h2 style="margin:0 0 4px">${isEscalation ? "Incident escalating" : "New API alert"}</h2>
        <p style="color:#555;margin:0 0 16px">An endpoint on Gradr is returning errors.</p>
        <table style="border-collapse:collapse;width:100%;font-size:14px">
          <tr><td style="padding:6px 0;color:#777">Endpoint</td><td><code>${notice.endpoint}</code></td></tr>
          <tr><td style="padding:6px 0;color:#777">Type</td><td>${KIND_LABEL[notice.kind] ?? notice.kind}</td></tr>
          <tr><td style="padding:6px 0;color:#777">Occurrences</td><td>${notice.occurrences}</td></tr>
          <tr><td style="padding:6px 0;color:#777">First seen</td><td>${new Date(notice.firstSeenAt).toUTCString()}</td></tr>
        </table>
        <pre style="background:#f5f5f5;padding:12px;border-radius:8px;font-size:12px;white-space:pre-wrap">${
          notice.message.slice(0, 800).replace(/</g, "&lt;")
        }</pre>
        <p style="font-size:13px;color:#777">Open the API health dashboard in Gradr admin to triage or replay affected webhooks.</p>
      </div>
    `,
  });
}

/**
 * Announces an alert on every configured channel.
 * Returns null on success, or a joined error string when a channel failed.
 */
export async function dispatchAlert(
  notice: AlertNotice,
  isEscalation = false,
): Promise<string | null> {
  const targets = alertingTargets();
  if (!targets.slack && !targets.email) return "no alert channel configured";

  const errors: string[] = [];
  const results = await Promise.allSettled([
    targets.slack ? postToSlack(notice, isEscalation) : Promise.resolve(),
    targets.email ? sendAlertEmail(notice, isEscalation) : Promise.resolve(),
  ]);
  const labels = ["slack", "email"];
  results.forEach((r, i) => {
    if (r.status === "rejected") {
      errors.push(`${labels[i]}: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`);
    }
  });

  return errors.length > 0 ? errors.join("; ") : null;
}
