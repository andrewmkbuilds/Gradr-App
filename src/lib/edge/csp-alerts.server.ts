/**
 * CSP report-only alerting + enforcement readiness endpoint.
 *
 * Actions
 *  - `check`     (cron key or admin) evaluate the last N days of reports, fire
 *                Slack/email alerts for volume spikes and for directive/origin
 *                pairs never seen before, and record what was announced so the
 *                same problem never pages twice.
 *  - `readiness` (cron key or admin) the enforce-CSP gate: report whether the
 *                candidate policy has been clean across auth, Supabase and the
 *                PWA for the required number of consecutive days. CI reads this
 *                and only then flips the policy to enforced.
 *  - `status`    (admin) everything the admin CSP monitor needs in one call.
 */
import { corsHeaders } from "./shared/cors";
import { createClient } from "./shared/supabase";
import { dispatchCspAlert } from "./shared/alerting";
import {
  analyzeCsp,
  bucketCspReports,
  reportsForCombo,
  CSP_DEFAULTS,
  type CspAnalysis,
  type CspViolationRow,
} from "@/lib/security/cspAnalysis";
import {
  CONTENT_SECURITY_POLICY_REPORT_ONLY,
  cspEnforcementEnabled,
} from "@/lib/security/headers";

const SITE_ORIGIN = "https://gradr.me";
const DASHBOARD_URL = `${SITE_ORIGIN}/admin/oauth-forensics?tab=csp`;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

let _admin: ReturnType<typeof createClient> | null = null;
function db() {
  if (!_admin) {
    _admin = createClient(process.env["SUPABASE_URL"]!, process.env["SUPABASE_SERVICE_ROLE_KEY"]!, {
      auth: { persistSession: false },
    });
  }
  return _admin;
}

function hasCronKey(req: Request): boolean {
  const secret = process.env["CRON_SECRET"];
  const presented = req.headers.get("x-cron-secret") ?? req.headers.get("x-cron-key");
  return Boolean(secret && presented && presented === secret);
}

async function isAdmin(req: Request): Promise<boolean> {
  const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!bearer) return false;
  const { data } = await db().auth.getUser(bearer);
  const user = data?.user;
  if (!user || user.is_anonymous) return false;
  const { data: ok } = await db().rpc("has_role", { _user_id: user.id, _role: "admin" });
  return ok === true;
}

async function loadReports(days: number): Promise<CspViolationRow[]> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const { data, error } = await db()
    .from("csp_violation_reports")
    .select("created_at, effective_directive, violated_directive, blocked_origin, blocked_uri, document_path, document_uri")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(5000);
  if (error) throw new Error(error.message);
  return (data ?? []) as CspViolationRow[];
}

/** Full report rows, used for chart drill-down and incident exports. */
interface CspDetailRow extends CspViolationRow {
  id?: string;
  source_file?: string | null;
  line_number?: number | null;
  column_number?: number | null;
  status_code?: number | null;
  disposition?: string | null;
  script_sample?: string | null;
  user_agent?: string | null;
}

async function loadDetailedReports(days: number, limit = 5000): Promise<CspDetailRow[]> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const { data, error } = await db()
    .from("csp_violation_reports")
    .select(
      "id, created_at, effective_directive, violated_directive, blocked_origin, blocked_uri, document_path, document_uri, source_file, line_number, column_number, status_code, disposition, script_sample, user_agent",
    )
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as CspDetailRow[];
}

/**
 * Deployment provenance for incident exports.
 *
 * Whoever reads the ticket needs to know *which build* produced the evidence,
 * so we carry whatever the CI/host injected rather than guessing.
 */
function buildMetadata() {
  const env = process.env;
  const repo = env["GITHUB_REPOSITORY"] ?? env["GRADR_REPOSITORY"] ?? null;
  const sha =
    env["GITHUB_SHA"] ?? env["CF_PAGES_COMMIT_SHA"] ?? env["COMMIT_SHA"] ?? env["VITE_COMMIT_SHA"] ?? null;
  const runId = env["GITHUB_RUN_ID"] ?? null;
  const prNumber = env["GITHUB_PR_NUMBER"] ?? null;
  return {
    repository: repo,
    commitSha: sha,
    commitUrl: repo && sha ? `https://github.com/${repo}/commit/${sha}` : null,
    branch: env["GITHUB_REF_NAME"] ?? env["CF_PAGES_BRANCH"] ?? null,
    pullRequest: prNumber,
    pullRequestUrl: repo && prNumber ? `https://github.com/${repo}/pull/${prNumber}` : null,
    workflowRunUrl: repo && runId ? `https://github.com/${repo}/actions/runs/${runId}` : null,
    environment: env["NODE_ENV"] ?? null,
  };
}

/** Alerts already announced, so a persistent combo doesn't page every hour. */
async function knownAlertKeys(): Promise<Set<string>> {
  const { data } = await db().from("csp_alert_notices").select("alert_key");
  return new Set(((data ?? []) as { alert_key: string }[]).map((r) => r.alert_key));
}

async function recordAlert(input: {
  alertKey: string;
  kind: "spike" | "new-combo" | "readiness";
  directive: string | null;
  blockedOrigin: string | null;
  headline: string;
  payload: unknown;
  deliveryError: string | null;
}): Promise<void> {
  await db()
    .from("csp_alert_notices")
    .upsert(
      {
        alert_key: input.alertKey,
        kind: input.kind,
        directive: input.directive,
        blocked_origin: input.blockedOrigin,
        headline: input.headline,
        payload: input.payload as Record<string, unknown>,
        last_alerted_at: new Date().toISOString(),
        delivery_error: input.deliveryError,
      },
      { onConflict: "alert_key" },
    );
}

/** Day-bucketed so a still-spiking combo can page again tomorrow, not hourly. */
const dayKey = () => new Date().toISOString().slice(0, 10);

async function runCheck(days: number, options: { dryRun: boolean }) {
  const rows = await loadReports(days);
  const analysis = analyzeCsp(rows, { baselineDays: days });
  const seen = await knownAlertKeys();
  const sent: { alertKey: string; kind: string; headline: string; error: string | null }[] = [];
  const skipped: string[] = [];

  const candidates: {
    alertKey: string;
    kind: "spike" | "new-combo";
    directive: string;
    blockedOrigin: string;
    headline: string;
    details: string[];
    payload: unknown;
  }[] = [];

  for (const spike of analysis.spikes) {
    candidates.push({
      alertKey: `spike:${spike.key}:${dayKey()}`,
      kind: "spike",
      directive: spike.directive,
      blockedOrigin: spike.blockedOrigin,
      headline: `${spike.recent} reports in ${analysis.windowHours}h for ${spike.directive} → ${spike.blockedOrigin} (${spike.multiple}x baseline)`,
      details: [
        `directive:      ${spike.directive}`,
        `blocked origin: ${spike.blockedOrigin}`,
        `recent (${analysis.windowHours}h): ${spike.recent}`,
        `baseline/window: ${spike.baselineRate}`,
        `multiple:       ${spike.multiple}x`,
        `sample path:    ${spike.samplePath ?? "n/a"}`,
        `critical surfaces: ${spike.surfaces.join(", ") || "none"}`,
      ],
      payload: spike,
    });
  }

  for (const combo of analysis.newCombos) {
    candidates.push({
      alertKey: `new-combo:${combo.key}`,
      kind: "new-combo",
      directive: combo.directive,
      blockedOrigin: combo.blockedOrigin,
      headline: `New violation pair ${combo.directive} → ${combo.blockedOrigin} (${combo.recent} reports)`,
      details: [
        `directive:      ${combo.directive}`,
        `blocked origin: ${combo.blockedOrigin}`,
        `first seen:     ${combo.firstSeen}`,
        `reports:        ${combo.recent}`,
        `sample path:    ${combo.samplePath ?? "n/a"}`,
        `critical surfaces: ${combo.surfaces.join(", ") || "none"}`,
      ],
      payload: combo,
    });
  }

  for (const candidate of candidates) {
    if (seen.has(candidate.alertKey)) {
      skipped.push(candidate.alertKey);
      continue;
    }
    if (options.dryRun) {
      sent.push({ alertKey: candidate.alertKey, kind: candidate.kind, headline: candidate.headline, error: "dry-run" });
      continue;
    }
    const error = await dispatchCspAlert({
      kind: candidate.kind,
      headline: candidate.headline,
      details: candidate.details,
      windowHours: analysis.windowHours,
      dashboardUrl: DASHBOARD_URL,
    });
    await recordAlert({
      alertKey: candidate.alertKey,
      kind: candidate.kind,
      directive: candidate.directive,
      blockedOrigin: candidate.blockedOrigin,
      headline: candidate.headline,
      payload: candidate.payload,
      deliveryError: error,
    });
    sent.push({ alertKey: candidate.alertKey, kind: candidate.kind, headline: candidate.headline, error });
  }

  return json({
    checkedAt: analysis.now,
    windowHours: analysis.windowHours,
    baselineDays: analysis.baselineDays,
    thresholds: { spikeMinReports: CSP_DEFAULTS.spikeMinReports, spikeFactor: CSP_DEFAULTS.spikeFactor },
    recentTotal: analysis.recentTotal,
    spikes: analysis.spikes.length,
    newCombos: analysis.newCombos.length,
    alertsSent: sent,
    alertsSuppressed: skipped.length,
    readiness: analysis.readiness,
  });
}

function readinessResponse(analysis: CspAnalysis) {
  const enforced = cspEnforcementEnabled();
  return json({
    ...analysis.readiness,
    enforced,
    mode: enforced ? "enforce" : "report-only",
    candidatePolicy: CONTENT_SECURITY_POLICY_REPORT_ONLY,
    /** CI uses this: promote the flag only when true and not already enforced. */
    shouldPromote: analysis.readiness.ready && !enforced,
    evaluatedAt: analysis.now,
  });
}

export const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  let body: Record<string, unknown> = {};
  try {
    body = ((await req.json()) ?? {}) as Record<string, unknown>;
  } catch {
    body = {};
  }
  const url = new URL(req.url);
  const action = String(body["action"] ?? url.searchParams.get("action") ?? "readiness").slice(0, 40);
  const days = Math.min(90, Math.max(1, Number(body["days"] ?? url.searchParams.get("days")) || CSP_DEFAULTS.baselineDays));

  if (!hasCronKey(req) && !(await isAdmin(req))) {
    return json({ error: "Admin access required" }, 403);
  }

  try {
    switch (action) {
      case "check":
        return await runCheck(days, { dryRun: body["dryRun"] === true });
      case "readiness": {
        const analysis = analyzeCsp(await loadReports(Math.max(days, CSP_DEFAULTS.requiredCleanDays)), {
          baselineDays: days,
        });
        return readinessResponse(analysis);
      }
      case "status": {
        const analysis = analyzeCsp(await loadReports(days), { baselineDays: days });
        const { data: notices } = await db()
          .from("csp_alert_notices")
          .select("*")
          .order("last_alerted_at", { ascending: false })
          .limit(50);
        return json({ analysis, notices: notices ?? [], enforced: cspEnforcementEnabled() });
      }
      /** Trend chart: day buckets plus the combos that explain each shape. */
      case "timeseries": {
        const rows = await loadReports(days);
        const analysis = analyzeCsp(rows, { baselineDays: days });
        return json({
          days,
          buckets: bucketCspReports(rows, { days }),
          combos: analysis.combos.slice(0, 100),
          spikes: analysis.spikes,
          newCombos: analysis.newCombos,
          windowHours: analysis.windowHours,
          generatedAt: analysis.now,
        });
      }
      /** Drill-down: the raw reports behind one directive/origin pair. */
      case "combo": {
        const comboKey = String(body["key"] ?? url.searchParams.get("key") ?? "").slice(0, 400);
        if (!comboKey.includes("|")) return json({ error: "A combo key is required" }, 400);
        const rows = await loadDetailedReports(days);
        const matches = reportsForCombo(rows, comboKey).slice(0, 200);
        return json({ key: comboKey, days, total: matches.length, reports: matches });
      }
      /** One-click incident bundle for auditing and ticket creation. */
      case "incident": {
        const rows = await loadDetailedReports(days, 2000);
        const analysis = analyzeCsp(rows, { baselineDays: days });
        const { data: notices } = await db()
          .from("csp_alert_notices")
          .select("*")
          .order("last_alerted_at", { ascending: false })
          .limit(100);
        return json({
          generatedAt: analysis.now,
          days,
          build: buildMetadata(),
          policy: {
            enforced: cspEnforcementEnabled(),
            mode: cspEnforcementEnabled() ? "enforce" : "report-only",
            candidate: CONTENT_SECURITY_POLICY_REPORT_ONLY,
          },
          readiness: analysis.readiness,
          totals: { reports: analysis.total, recent: analysis.recentTotal, combos: analysis.combos.length },
          buckets: bucketCspReports(rows, { days }),
          combos: analysis.combos,
          spikes: analysis.spikes,
          newCombos: analysis.newCombos,
          notices: notices ?? [],
          reports: rows.slice(0, 1000),
        });
      }
      default:
        return json({ error: `Unknown action "${action}"` }, 400);
    }
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
};
