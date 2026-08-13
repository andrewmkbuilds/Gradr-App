/**
 * Security scan ledger + alert dashboard feed.
 *
 * Actions (all admin-session gated; `record` also accepts the CI cron key):
 *  - `record`  store one scan run: the findings snapshot, the internal_ids seen
 *              and the commit / PR that was deployed at that moment.
 *  - `list`    the most recent runs for the admin ledger.
 *  - `export`  the latest (or a chosen) run flattened for JSON/CSV download,
 *              with commit + PR metadata attached to every row.
 *  - `alerts`  edge-function error rates and permission-denied (has_role)
 *              spikes evaluated against the configured thresholds.
 */
import { corsHeaders } from "./shared/cors";
import { createClient } from "./shared/supabase";
import {
  EDGE_ERROR_RATE,
  PERMISSION_DENIED,
  errorRateThresholdFor,
  severityForRate,
  type AlertSeverity,
} from "@/config/securityAlerts";

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

async function adminUserId(req: Request): Promise<string | null> {
  const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!bearer) return null;
  const { data } = await db().auth.getUser(bearer);
  const user = data?.user;
  if (!user || user.is_anonymous) return null;
  const { data: ok } = await db().rpc("has_role", { _user_id: user.id, _role: "admin" });
  return ok === true ? user.id : null;
}

interface ScanFinding {
  internal_id?: string;
  id?: string;
  name?: string;
  level?: string;
  scanner?: string;
  description?: string;
}

const str = (v: unknown, max = 200): string | null =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;

/** Flattened export row — one line per finding, commit metadata denormalised. */
export interface ScanExportRow {
  run_id: string;
  scanned_at: string;
  source: string;
  internal_id: string;
  name: string;
  level: string;
  scanner: string;
  description: string;
  commit_sha: string;
  commit_url: string;
  branch: string;
  pr_number: string;
  pr_url: string;
}

async function recordRun(req: Request, body: Record<string, unknown>) {
  const rawFindings = Array.isArray(body["findings"]) ? (body["findings"] as ScanFinding[]) : [];
  const findings = rawFindings.slice(0, 500);
  const internalIds = [
    ...new Set(findings.map((f) => str(f.internal_id ?? f.id, 120)).filter(Boolean) as string[]),
  ];
  const counts: Record<string, number> = {};
  for (const f of findings) {
    const level = str(f.level, 20) ?? "unknown";
    counts[level] = (counts[level] ?? 0) + 1;
  }

  const prNumber = Number(body["prNumber"]);
  const { data, error } = await db()
    .from("security_scan_runs")
    .insert({
      source: str(body["source"], 40) ?? "manual",
      scanned_at: str(body["scannedAt"], 40) ?? new Date().toISOString(),
      finding_count: findings.length,
      internal_ids: internalIds,
      counts_by_level: counts,
      findings,
      commit_sha: str(body["commitSha"], 64),
      commit_url: str(body["commitUrl"], 300),
      branch: str(body["branch"], 200),
      pr_number: Number.isFinite(prNumber) && prNumber > 0 ? Math.trunc(prNumber) : null,
      pr_url: str(body["prUrl"], 300),
      notes: str(body["notes"], 1000),
    })
    .select("id, scanned_at")
    .maybeSingle();

  if (error) return json({ error: error.message }, 500);
  return json({ ok: true, run: data, internalIds, counts });
}

async function listRuns(limit: number) {
  const { data, error } = await db()
    .from("security_scan_runs")
    .select(
      "id, scanned_at, source, finding_count, internal_ids, counts_by_level, commit_sha, commit_url, branch, pr_number, pr_url, notes",
    )
    .order("scanned_at", { ascending: false })
    .limit(limit);
  if (error) return json({ error: error.message }, 500);
  return json({ runs: data ?? [] });
}

async function exportRun(runId: string | null) {
  let q = db()
    .from("security_scan_runs")
    .select("*")
    .order("scanned_at", { ascending: false })
    .limit(1);
  if (runId) q = db().from("security_scan_runs").select("*").eq("id", runId).limit(1);

  const { data, error } = await q;
  if (error) return json({ error: error.message }, 500);
  const run = (data ?? [])[0];
  if (!run) return json({ error: "No scan runs recorded yet" }, 404);

  const findings: ScanFinding[] = Array.isArray(run.findings) ? run.findings : [];
  const rows: ScanExportRow[] = findings.map((f) => ({
    run_id: String(run.id),
    scanned_at: String(run.scanned_at),
    source: String(run.source ?? ""),
    internal_id: String(f.internal_id ?? f.id ?? ""),
    name: String(f.name ?? ""),
    level: String(f.level ?? ""),
    scanner: String(f.scanner ?? ""),
    description: String(f.description ?? ""),
    commit_sha: String(run.commit_sha ?? ""),
    commit_url: String(run.commit_url ?? ""),
    branch: String(run.branch ?? ""),
    pr_number: run.pr_number ? String(run.pr_number) : "",
    pr_url: String(run.pr_url ?? ""),
  }));

  return json({ run, rows });
}

interface EndpointRate {
  endpoint: string;
  calls: number;
  errors: number;
  rate: number;
  severity: AlertSeverity;
  warnRate: number;
  criticalRate: number;
}

async function alerts(windowMinutes: number) {
  const since = new Date(Date.now() - windowMinutes * 60_000).toISOString();

  const { data: events, error } = await db()
    .from("api_health_events")
    .select("endpoint, status_code, outcome, created_at")
    .gte("created_at", since)
    .limit(5000);
  if (error) return json({ error: error.message }, 500);

  const byEndpoint = new Map<string, { calls: number; errors: number }>();
  for (const e of (events ?? []) as Array<{ endpoint: string; outcome: string }>) {
    const row = byEndpoint.get(e.endpoint) ?? { calls: 0, errors: 0 };
    row.calls += 1;
    if (e.outcome === "server_error") row.errors += 1;
    byEndpoint.set(e.endpoint, row);
  }

  const endpoints: EndpointRate[] = [...byEndpoint.entries()]
    .map(([endpoint, r]) => {
      const t = errorRateThresholdFor(endpoint);
      const rate = r.calls ? r.errors / r.calls : 0;
      const severity: AlertSeverity =
        r.calls < t.minSamples ? "ok" : severityForRate(rate, t);
      return {
        endpoint,
        calls: r.calls,
        errors: r.errors,
        rate,
        severity,
        warnRate: t.warnRate,
        criticalRate: t.criticalRate,
      };
    })
    .sort((a, b) => b.rate - a.rate || b.errors - a.errors);

  const pdSince = new Date(Date.now() - PERMISSION_DENIED.windowMinutes * 60_000).toISOString();
  const { data: denials } = await db()
    .from("permission_denied_signals")
    .select("route, authenticated, mentions_has_role, relation, message, created_at")
    .gte("created_at", pdSince)
    .order("created_at", { ascending: false })
    .limit(1000);

  const rows = (denials ?? []) as Array<{
    route: string;
    authenticated: boolean;
    mentions_has_role: boolean;
    relation: string | null;
    message: string | null;
    created_at: string;
  }>;

  const anonHasRole = rows.filter((r) => r.mentions_has_role && !r.authenticated).length;
  let pdSeverity: AlertSeverity = "ok";
  if (anonHasRole >= PERMISSION_DENIED.hasRoleCriticalCount) pdSeverity = "critical";
  else if (rows.length >= PERMISSION_DENIED.criticalCount) pdSeverity = "critical";
  else if (rows.length >= PERMISSION_DENIED.warnCount) pdSeverity = "warning";

  const byRoute = new Map<string, number>();
  for (const r of rows) byRoute.set(r.route, (byRoute.get(r.route) ?? 0) + 1);

  return json({
    windowMinutes,
    thresholds: { edge: EDGE_ERROR_RATE, permissionDenied: PERMISSION_DENIED },
    endpoints,
    permissionDenied: {
      total: rows.length,
      anonHasRole,
      severity: pdSeverity,
      byRoute: [...byRoute.entries()]
        .map(([route, count]) => ({ route, count }))
        .sort((a, b) => b.count - a.count),
      recent: rows.slice(0, 50),
    },
  });
}

export const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const url = new URL(req.url);
  const action = String(body["action"] ?? url.searchParams.get("action") ?? "list").slice(0, 32);

  const actor = await adminUserId(req);
  // Only CI's unattended recorder may use the cron key; every read is admin-only.
  if (!actor && !(action === "record" && hasCronKey(req))) {
    return json({ error: "Admin access required" }, 403);
  }

  try {
    switch (action) {
      case "record":
        return await recordRun(req, body);
      case "list":
        return await listRuns(Math.min(200, Math.max(1, Number(body["limit"]) || 50)));
      case "export":
        return await exportRun(str(body["runId"], 64));
      case "alerts":
        return await alerts(Math.min(1440, Math.max(5, Number(body["windowMinutes"]) || 60)));
      default:
        return json({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (err) {
    console.error("security-scans error", err);
    return json({ error: err instanceof Error ? err.message : "Unexpected error" }, 500);
  }
};
