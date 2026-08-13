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
    email: Boolean(process.env['ALERT_EMAIL_TO'] && process.env['LOVABLE_API_KEY']),
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
  const apiKey = process.env['LOVABLE_API_KEY'];
  const from = process.env['ALERT_EMAIL_FROM'] ?? 'alerts@notify.gradr.me';
  if (!to) return;
  if (!apiKey) throw new Error('LOVABLE_API_KEY is not configured');

  const subject = isEscalation
    ? `[Gradr] Escalating: ${notice.endpoint} (${notice.occurrences} failures)`
    : `[Gradr] API alert: ${notice.endpoint}`;

  await sendLovableEmail({
    to,
    from,
    subject,
    text: `${subject}\n\nEndpoint: ${notice.endpoint}\nType: ${notice.kind}\nOccurrences: ${notice.occurrences}\nFirst seen: ${notice.firstSeenAt}\n\n${notice.message.slice(0, 800)}`,
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
        <pre style="background:#f2f0ef;padding:12px;border-radius:8px;font-size:12px;white-space:pre-wrap">${
          notice.message.slice(0, 800).replace(/</g, "&lt;")
        }</pre>
        <p style="font-size:13px;color:#777">Open the API health dashboard in Gradr admin to triage or replay affected webhooks.</p>
      </div>
    `,
  }, { apiKey, sendUrl: process.env['LOVABLE_SEND_URL'] });
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

/* ------------------------------------------------------- OAuth flow alerts -- */

export interface OAuthAlertNotice {
  /** "flow-check" (daily headless run) or "deviation" (redirect chain drifted). */
  kind: "flow-check" | "deviation";
  runId: string;
  source: string;
  /** Short human summary, e.g. "2 of 3 accounts failed". */
  headline: string;
  /** One line per failing account / deviating hop chain. */
  details: string[];
  expectedFinalUrl: string;
  dashboardUrl?: string;
}

const OAUTH_ALERT_TITLE: Record<OAuthAlertNotice["kind"], string> = {
  "flow-check": "Daily OAuth flow check failed",
  deviation: "OAuth redirect-chain deviation detected",
};

async function postOAuthSlack(notice: OAuthAlertNotice): Promise<void> {
  const url = process.env['ALERT_SLACK_WEBHOOK_URL'];
  if (!url) return;
  const title = OAUTH_ALERT_TITLE[notice.kind];
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: `:rotating_light: Gradr — ${title}`,
      blocks: [
        { type: "header", text: { type: "plain_text", text: `Gradr — ${title}` } },
        {
          type: "section",
          fields: [
            { type: "mrkdwn", text: `*Run*\n\`${notice.runId}\`` },
            { type: "mrkdwn", text: `*Source*\n${notice.source}` },
            { type: "mrkdwn", text: `*Expected landing*\n${notice.expectedFinalUrl}` },
            { type: "mrkdwn", text: `*Summary*\n${notice.headline}` },
          ],
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Findings*\n\`\`\`${notice.details.slice(0, 20).join("\n").slice(0, 2500) || "see dashboard"}\`\`\``,
          },
        },
        ...(notice.dashboardUrl
          ? [{ type: "context", elements: [{ type: "mrkdwn", text: `<${notice.dashboardUrl}|Open OAuth forensics>` }] }]
          : []),
      ],
    }),
  });
  if (!res.ok) throw new Error(`Slack responded ${res.status}`);
}

async function sendOAuthEmail(notice: OAuthAlertNotice): Promise<void> {
  const to = process.env['ALERT_EMAIL_TO'];
  const apiKey = process.env['LOVABLE_API_KEY'];
  const from = process.env['ALERT_EMAIL_FROM'] ?? 'alerts@notify.gradr.me';
  if (!to) return;
  if (!apiKey) throw new Error('LOVABLE_API_KEY is not configured');

  const title = OAUTH_ALERT_TITLE[notice.kind];
  const subject = `[Gradr] ${title} — ${notice.headline}`;
  const escaped = (value: string) => value.replace(/</g, "&lt;");

  await sendLovableEmail({
    to,
    from,
    subject,
    text: `${subject}\n\nRun: ${notice.runId}\nSource: ${notice.source}\nExpected landing: ${notice.expectedFinalUrl}\n\n${notice.details.join("\n")}\n\n${notice.dashboardUrl ?? ""}`,
    html: `
      <div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:600px">
        <h2 style="margin:0 0 4px;color:#245F73">${title}</h2>
        <p style="color:#555;margin:0 0 16px">${escaped(notice.headline)}</p>
        <table style="border-collapse:collapse;width:100%;font-size:14px">
          <tr><td style="padding:6px 0;color:#777">Run</td><td><code>${escaped(notice.runId)}</code></td></tr>
          <tr><td style="padding:6px 0;color:#777">Source</td><td>${escaped(notice.source)}</td></tr>
          <tr><td style="padding:6px 0;color:#777">Expected landing</td><td>${escaped(notice.expectedFinalUrl)}</td></tr>
        </table>
        <pre style="background:#F2F0EF;padding:12px;border-radius:8px;font-size:12px;white-space:pre-wrap">${
          escaped(notice.details.join("\n").slice(0, 3000))
        }</pre>
        ${
          notice.dashboardUrl
            ? `<p style="font-size:13px"><a href="${notice.dashboardUrl}" style="color:#733E24">Open OAuth forensics</a></p>`
            : ""
        }
      </div>
    `,
  }, { apiKey, sendUrl: process.env['LOVABLE_SEND_URL'] });
}

/**
 * Announces an OAuth flow-check failure or redirect-chain deviation on every
 * configured channel. Best-effort: never throws into the caller's request.
 */
export async function dispatchOAuthAlert(notice: OAuthAlertNotice): Promise<string | null> {
  const targets = alertingTargets();
  if (!targets.slack && !targets.email) return "no alert channel configured";

  const errors: string[] = [];
  const results = await Promise.allSettled([
    targets.slack ? postOAuthSlack(notice) : Promise.resolve(),
    targets.email ? sendOAuthEmail(notice) : Promise.resolve(),
  ]);
  ["slack", "email"].forEach((label, i) => {
    const r = results[i];
    if (r && r.status === "rejected") {
      errors.push(`${label}: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`);
    }
  });
  return errors.length > 0 ? errors.join("; ") : null;
}

/* ---------------------------------------------------------- CSP alerts -- */

export interface CspAlertNotice {
  /** "spike" = volume above threshold; "new-combo" = unseen directive/origin pair. */
  kind: "spike" | "new-combo" | "readiness";
  headline: string;
  /** One line per affected directive/origin pair. */
  details: string[];
  windowHours: number;
  dashboardUrl?: string;
}

const CSP_ALERT_TITLE: Record<CspAlertNotice["kind"], string> = {
  spike: "CSP violation spike",
  "new-combo": "New CSP directive/origin violation",
  readiness: "CSP enforcement readiness changed",
};

async function postCspSlack(notice: CspAlertNotice): Promise<void> {
  const url = process.env['ALERT_SLACK_WEBHOOK_URL'];
  if (!url) return;
  const title = CSP_ALERT_TITLE[notice.kind];
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: `:shield: Gradr — ${title}`,
      blocks: [
        { type: "header", text: { type: "plain_text", text: `Gradr — ${title}` } },
        {
          type: "section",
          fields: [
            { type: "mrkdwn", text: `*Window*\nlast ${notice.windowHours}h` },
            { type: "mrkdwn", text: `*Summary*\n${notice.headline}` },
          ],
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Affected*\n\`\`\`${notice.details.slice(0, 20).join("\n").slice(0, 2500) || "see dashboard"}\`\`\``,
          },
        },
        ...(notice.dashboardUrl
          ? [{ type: "context", elements: [{ type: "mrkdwn", text: `<${notice.dashboardUrl}|Open CSP monitor>` }] }]
          : []),
      ],
    }),
  });
  if (!res.ok) throw new Error(`Slack responded ${res.status}`);
}

async function sendCspEmail(notice: CspAlertNotice): Promise<void> {
  const to = process.env['ALERT_EMAIL_TO'];
  const apiKey = process.env['LOVABLE_API_KEY'];
  const from = process.env['ALERT_EMAIL_FROM'] ?? 'alerts@notify.gradr.me';
  if (!to) return;
  if (!apiKey) throw new Error('LOVABLE_API_KEY is not configured');

  const title = CSP_ALERT_TITLE[notice.kind];
  const subject = `[Gradr] ${title} — ${notice.headline}`;
  const escaped = (value: string) => value.replace(/</g, "&lt;");

  await sendLovableEmail({
    to,
    from,
    subject,
    text: `${subject}\n\nWindow: last ${notice.windowHours}h\n\n${notice.details.join("\n")}\n\n${notice.dashboardUrl ?? ""}`,
    html: `
      <div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:600px">
        <h2 style="margin:0 0 4px;color:#245F73">${title}</h2>
        <p style="color:#555;margin:0 0 16px">${escaped(notice.headline)}</p>
        <p style="font-size:13px;color:#777">Window: last ${notice.windowHours} hours</p>
        <pre style="background:#F2F0EF;padding:12px;border-radius:8px;font-size:12px;white-space:pre-wrap">${
          escaped(notice.details.join("\n").slice(0, 3000))
        }</pre>
        ${
          notice.dashboardUrl
            ? `<p style="font-size:13px"><a href="${notice.dashboardUrl}" style="color:#733E24">Open the CSP monitor</a></p>`
            : ""
        }
      </div>
    `,
  }, { apiKey, sendUrl: process.env['LOVABLE_SEND_URL'] });
}

/**
 * Announces a CSP spike, a newly seen directive/origin pair, or a change in
 * enforcement readiness. Best-effort, exactly like the other dispatchers.
 */
export async function dispatchCspAlert(notice: CspAlertNotice): Promise<string | null> {
  const targets = alertingTargets();
  if (!targets.slack && !targets.email) return "no alert channel configured";

  const errors: string[] = [];
  const results = await Promise.allSettled([
    targets.slack ? postCspSlack(notice) : Promise.resolve(),
    targets.email ? sendCspEmail(notice) : Promise.resolve(),
  ]);
  ["slack", "email"].forEach((label, i) => {
    const r = results[i];
    if (r && r.status === "rejected") {
      errors.push(`${label}: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`);
    }
  });
  return errors.length > 0 ? errors.join("; ") : null;
}
