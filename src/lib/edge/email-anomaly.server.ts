/**
 * Scheduled anomaly detection for email delivery health.
 *
 * Three questions are asked every run, over the last hour, always on
 * deduplicated messages (one email = many `email_send_log` rows):
 *
 *  1. Volume spike  — is this hour's send volume far above the trailing
 *     7-day hourly baseline? A spike usually means a loop, a retry storm or
 *     an accidental bulk send, and it is the cheapest early warning there is.
 *  2. Bounce rate   — bounces above threshold burn sender reputation for
 *     every future email, so they matter long before anyone complains.
 *  3. Complaint rate— spam complaints are the fastest route to a blocked
 *     sending domain; the tolerated rate is deliberately tiny.
 *  4. Failure rate  — dead-lettered/failed sends mean users are not getting
 *     mail the app believes it sent.
 *
 * Each anomaly is written once per metric per hour window (unique constraint),
 * then announced to every admin through the in-app notification centre and the
 * configured Slack/email alert channels.
 */
import { corsHeaders } from "./shared/cors";
import { createClient } from "./shared/supabase";
import { dispatchAlert } from "./shared/alerting";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

export const THRESHOLDS = {
  /** Minimum emails in the window before rate maths means anything. */
  minVolume: 20,
  /** Observed volume must exceed baseline by this factor to count as a spike. */
  spikeFactor: 4,
  /** Floor so a quiet app does not alert on 3 → 12 emails. */
  spikeMinVolume: 50,
  bounceRate: 0.05,
  complaintRate: 0.001,
  failureRate: 0.1,
} as const;

interface LogRow {
  message_id: string;
  status: string;
  created_at: string;
}

/** Latest status per message — the same dedupe rule the dashboard uses. */
export function dedupeLatest(rows: LogRow[]): LogRow[] {
  const latest = new Map<string, LogRow>();
  for (const row of rows) {
    if (!row.message_id) continue;
    const seen = latest.get(row.message_id);
    if (!seen || new Date(row.created_at) > new Date(seen.created_at)) latest.set(row.message_id, row);
  }
  return [...latest.values()];
}

export interface Anomaly {
  metric: string;
  observed: number;
  baseline: number | null;
  threshold: number;
  severity: "warning" | "critical";
  title: string;
  body: string;
  detail: Record<string, unknown>;
}

/** Pure detection step, so thresholds can be reasoned about and tested. */
export function detect(input: {
  volume: number;
  baselineHourly: number;
  bounced: number;
  complained: number;
  failed: number;
}): Anomaly[] {
  const found: Anomaly[] = [];
  const { volume, baselineHourly, bounced, complained, failed } = input;

  if (
    volume >= THRESHOLDS.spikeMinVolume &&
    baselineHourly > 0 &&
    volume > baselineHourly * THRESHOLDS.spikeFactor
  ) {
    found.push({
      metric: "delivery_spike",
      observed: volume,
      baseline: Number(baselineHourly.toFixed(2)),
      threshold: Number((baselineHourly * THRESHOLDS.spikeFactor).toFixed(2)),
      severity: "warning",
      title: "Email delivery spike",
      body: `${volume} emails were queued in the last hour — ${(volume / baselineHourly).toFixed(1)}× the 7-day hourly average of ${baselineHourly.toFixed(1)}.`,
      detail: { volume, baselineHourly },
    });
  }

  if (volume >= THRESHOLDS.minVolume) {
    const rate = (n: number) => n / volume;

    if (rate(bounced) > THRESHOLDS.bounceRate) {
      found.push({
        metric: "bounce_rate",
        observed: Number(rate(bounced).toFixed(4)),
        baseline: null,
        threshold: THRESHOLDS.bounceRate,
        severity: "critical",
        title: "Email bounce rate above threshold",
        body: `${bounced} of ${volume} emails bounced (${(rate(bounced) * 100).toFixed(1)}%). Sustained bounces damage sender reputation for gradr.me.`,
        detail: { bounced, volume },
      });
    }

    if (rate(complained) > THRESHOLDS.complaintRate) {
      found.push({
        metric: "complaint_rate",
        observed: Number(rate(complained).toFixed(4)),
        baseline: null,
        threshold: THRESHOLDS.complaintRate,
        severity: "critical",
        title: "Spam complaints above threshold",
        body: `${complained} of ${volume} emails were marked as spam (${(rate(complained) * 100).toFixed(2)}%). This is the fastest way to lose sending reputation.`,
        detail: { complained, volume },
      });
    }

    if (rate(failed) > THRESHOLDS.failureRate) {
      found.push({
        metric: "failure_rate",
        observed: Number(rate(failed).toFixed(4)),
        baseline: null,
        threshold: THRESHOLDS.failureRate,
        severity: "warning",
        title: "Email delivery failures above threshold",
        body: `${failed} of ${volume} emails failed or were dead-lettered (${(rate(failed) * 100).toFixed(1)}%). Recipients are not receiving mail the app believes it sent.`,
        detail: { failed, volume },
      });
    }
  }

  return found;
}

/**
 * The scheduler authenticates with a shared secret: either an explicit
 * CRON_SECRET, or the service-role key that pg_cron already holds in vault for
 * the email queue job, so no new secret has to be provisioned.
 */
function authorised(req: Request): boolean {
  const header = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  const query = new URL(req.url).searchParams.get("key") ?? "";
  const secrets = [
    process.env["CRON_SECRET"],
    process.env["LOVABLE_API_KEY"],
    process.env["SUPABASE_SERVICE_ROLE_KEY"],
  ].filter((s): s is string => Boolean(s));
  return secrets.some((s) => header === s || query === s);
}

export const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const db = createClient(
    process.env["SUPABASE_URL"]!,
    process.env["SUPABASE_SERVICE_ROLE_KEY"]!,
    { auth: { persistSession: false } },
  );

  // Either the scheduler's shared secret, or a signed-in admin running it manually.
  let actor = "cron";
  if (!authorised(req)) {
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return json({ error: "Authentication required" }, 401);
    const { data: userData } = await db.auth.getUser(token);
    const user = userData?.user;
    if (!user || user.is_anonymous) return json({ error: "Admin access required" }, 403);
    const { data: isAdmin } = await db.rpc("has_role", { _user_id: user.id, _role: "admin" });
    if (isAdmin !== true) return json({ error: "Admin access required" }, 403);
    actor = user.id;
  }

  const now = new Date();
  const windowStart = new Date(Math.floor(now.getTime() / 3_600_000) * 3_600_000);
  const windowEnd = new Date(windowStart.getTime() + 3_600_000);
  const baselineStart = new Date(windowStart.getTime() - 7 * 24 * 3_600_000);

  const { data: recent, error: recentError } = await db
    .from("email_send_log")
    .select("message_id, status, created_at")
    .gte("created_at", windowStart.toISOString())
    .limit(20_000);
  if (recentError) return json({ error: recentError.message }, 500);

  const { data: baselineRows } = await db
    .from("email_send_log")
    .select("message_id, status, created_at")
    .gte("created_at", baselineStart.toISOString())
    .lt("created_at", windowStart.toISOString())
    .limit(50_000);

  const windowMessages = dedupeLatest((recent ?? []) as LogRow[]);
  const baselineMessages = dedupeLatest((baselineRows ?? []) as LogRow[]);
  const baselineHourly = baselineMessages.length / (7 * 24);

  const { data: events } = await db
    .from("email_events")
    .select("message_id, event_type")
    .gte("created_at", windowStart.toISOString())
    .limit(20_000);

  const unique = (type: string) =>
    new Set(
      ((events ?? []) as { message_id: string; event_type: string }[])
        .filter((e) => e.event_type === type)
        .map((e) => e.message_id),
    ).size;

  const anomalies = detect({
    volume: windowMessages.length,
    baselineHourly,
    bounced: unique("bounced"),
    complained: unique("complained"),
    failed: windowMessages.filter((m) => m.status === "dlq" || m.status === "failed").length,
  });

  const raised: string[] = [];

  for (const anomaly of anomalies) {
    // The unique (metric, window_start) constraint makes this idempotent:
    // running the job twice in an hour cannot double-notify.
    const { data: inserted, error } = await db
      .from("email_anomalies")
      .insert({
        metric: anomaly.metric,
        window_start: windowStart.toISOString(),
        window_end: windowEnd.toISOString(),
        observed: anomaly.observed,
        baseline: anomaly.baseline,
        threshold: anomaly.threshold,
        severity: anomaly.severity,
        detail: { ...anomaly.detail, actor },
      })
      .select("id")
      .maybeSingle();

    if (error || !inserted) continue;
    raised.push(anomaly.metric);

    // Fan out to the admin notification centre.
    const { data: admins } = await db.from("user_roles").select("user_id").eq("role", "admin");
    const rows = (admins ?? []).map((a: { user_id: string }) => ({
      user_id: a.user_id,
      type: "email_ops_anomaly",
      title: anomaly.title,
      body: anomaly.body,
      link: "/admin/email-ops",
      metadata: { metric: anomaly.metric, severity: anomaly.severity, ...anomaly.detail },
    }));
    if (rows.length > 0) await db.from("notifications").insert(rows);

    const notifyError = await dispatchAlert(
      {
        endpoint: "email-delivery",
        kind: anomaly.metric,
        message: anomaly.body,
        occurrences: 1,
        firstSeenAt: windowStart.toISOString(),
      },
      anomaly.severity === "critical",
    ).catch((err) => (err instanceof Error ? err.message : String(err)));

    await db
      .from("email_anomalies")
      .update({ notified_at: new Date().toISOString(), notify_error: notifyError })
      .eq("id", inserted.id);
  }

  return json({
    window: { start: windowStart.toISOString(), end: windowEnd.toISOString() },
    volume: windowMessages.length,
    baselineHourly: Number(baselineHourly.toFixed(2)),
    anomalies: anomalies.map((a) => a.metric),
    raised,
  });
};
