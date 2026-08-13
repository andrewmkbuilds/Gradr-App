/**
 * Weekly security digest: what changed in CSP report-only violations and in the
 * deployed metadata fingerprint since last week, delivered to Slack and email.
 *
 * Actions
 *  - `ingest`  (cron key) — CI posts the fingerprint snapshot it just captured,
 *               together with the workflow run and artifact URLs so the digest
 *               can link straight at the evidence.
 *  - `preview` (admin)    — build the digest without sending it.
 *  - `send`    (cron key or admin) — build, deliver and record the digest.
 *  - `runs`    (admin)    — recent digest history for the admin console.
 *
 * Everything that returns violation payloads stays admin-only; the cron key can
 * only *trigger* work, never read incident detail through this endpoint.
 */
import { corsHeaders } from "./shared/cors";
import { createClient } from "./shared/supabase";
import { dispatchSecurityDigest } from "./shared/alerting";
import { analyzeCsp, type CspViolationRow } from "@/lib/security/cspAnalysis";
import { cspEnforcementEnabled } from "@/lib/security/headers";

const SITE_ORIGIN = "https://gradr.me";
const CSP_DASHBOARD = `${SITE_ORIGIN}/admin/oauth-forensics?tab=csp`;
const WEEK_MS = 7 * 86_400_000;

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

const str = (value: unknown, max = 400): string | null =>
  typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;

const list = (value: unknown, max = 50): string[] =>
  Array.isArray(value) ? value.slice(0, max).map((v) => String(v).slice(0, 500)) : [];

/** Deep link into the admin export, pre-filtered to the digest window. */
function exportLink(fromIso: string, toIso: string, severity: "critical" | "warning" | "all") {
  const params = new URLSearchParams({
    tab: "csp",
    from: fromIso.slice(0, 10),
    to: toIso.slice(0, 10),
    severity,
  });
  return `${SITE_ORIGIN}/admin/oauth-forensics?${params.toString()}`;
}

/* --------------------------------------------------------------- ingest -- */

interface FingerprintRow {
  id: string;
  captured_at: string;
  origin: string;
  commit_sha: string | null;
  branch: string | null;
  run_url: string | null;
  artifact_url: string | null;
  signal_count: number;
  severity: string;
  added: unknown;
  removed: unknown;
  changed: unknown;
}

async function ingestFingerprint(body: Record<string, unknown>): Promise<Response> {
  const added = list(body["added"]);
  const removed = list(body["removed"]);
  const changed = list(body["changed"]);
  const signalCount = Number(body["signalCount"]);

  const { data, error } = await db()
    .from("fingerprint_snapshots")
    .insert({
      origin: str(body["origin"], 200) ?? SITE_ORIGIN,
      source: str(body["source"], 40) ?? "ci",
      commit_sha: str(body["commitSha"], 80),
      branch: str(body["branch"], 120),
      run_id: str(body["runId"], 40),
      run_url: str(body["runUrl"], 500),
      artifact_url: str(body["artifactUrl"], 500),
      signal_count: Number.isFinite(signalCount) ? Math.max(0, Math.round(signalCount)) : added.length,
      severity: added.length > 0 ? "warning" : "info",
      added,
      removed,
      changed,
      signals: (body["signals"] ?? {}) as Record<string, unknown>,
    })
    .select("id, captured_at")
    .single();

  if (error) return json({ error: error.message }, 500);
  return json({ ok: true, snapshot: data });
}

/* --------------------------------------------------------------- digest -- */

async function loadReports(fromIso: string, toIso: string): Promise<CspViolationRow[]> {
  const { data, error } = await db()
    .from("csp_violation_reports")
    .select("created_at, effective_directive, violated_directive, blocked_origin, blocked_uri, document_path, document_uri")
    .gte("created_at", fromIso)
    .lte("created_at", toIso)
    .order("created_at", { ascending: false })
    .limit(5000);
  if (error) throw new Error(error.message);
  return (data ?? []) as CspViolationRow[];
}

const delta = (now: number, before: number) => {
  const diff = now - before;
  const sign = diff > 0 ? "+" : "";
  const pct = before === 0 ? (now === 0 ? "0%" : "new") : `${sign}${Math.round((diff / before) * 100)}%`;
  return { current: now, previous: before, diff, direction: diff > 0 ? "up" : diff < 0 ? "down" : "flat", pct };
};

export interface SecurityDigest {
  generatedAt: string;
  period: { start: string; end: string; previousStart: string };
  csp: {
    reports: ReturnType<typeof delta>;
    criticalReports: ReturnType<typeof delta>;
    combos: ReturnType<typeof delta>;
    newCombos: { key: string; directive: string; blockedOrigin: string; recent: number; surfaces: string[] }[];
    topCombos: { directive: string; blockedOrigin: string; total: number; surfaces: string[] }[];
    readiness: { ready: boolean; cleanDays: number; requiredCleanDays: number; summary: string };
    enforced: boolean;
  };
  fingerprint: {
    latest: FingerprintRow | null;
    previous: FingerprintRow | null;
    added: string[];
    removed: string[];
    changed: string[];
    signalCount: ReturnType<typeof delta>;
  };
  links: { label: string; url: string }[];
  headline: string;
}

async function buildDigest(now = new Date()): Promise<SecurityDigest> {
  const end = now.toISOString();
  const start = new Date(now.getTime() - WEEK_MS).toISOString();
  const previousStart = new Date(now.getTime() - 2 * WEEK_MS).toISOString();

  const [thisWeek, lastWeek] = await Promise.all([
    loadReports(start, end),
    loadReports(previousStart, start),
  ]);

  const current = analyzeCsp(thisWeek, { now, baselineDays: 7 });
  const previous = analyzeCsp(lastWeek, { now: new Date(now.getTime() - WEEK_MS), baselineDays: 7 });

  const criticalNow = current.combos.filter((c) => c.surfaces.length > 0).reduce((sum, c) => sum + c.total, 0);
  const criticalBefore = previous.combos.filter((c) => c.surfaces.length > 0).reduce((sum, c) => sum + c.total, 0);

  const knownKeys = new Set(previous.combos.map((c) => c.key));
  const newCombos = current.combos
    .filter((c) => !knownKeys.has(c.key))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10)
    .map((c) => ({
      key: c.key,
      directive: c.directive,
      blockedOrigin: c.blockedOrigin,
      recent: c.total,
      surfaces: [...c.surfaces],
    }));

  const { data: snapshots } = await db()
    .from("fingerprint_snapshots")
    .select("id, captured_at, origin, commit_sha, branch, run_url, artifact_url, signal_count, severity, added, removed, changed")
    .order("captured_at", { ascending: false })
    .limit(2);
  const rows = (snapshots ?? []) as FingerprintRow[];
  const latest = rows[0] ?? null;
  const prevSnapshot = rows[1] ?? null;

  const digestLinks: { label: string; url: string }[] = [
    { label: "Admin CSP monitor", url: CSP_DASHBOARD },
    { label: "Critical incident export (this week)", url: exportLink(start, end, "critical") },
    { label: "Full incident export (this week)", url: exportLink(start, end, "all") },
  ];
  if (latest?.run_url) digestLinks.push({ label: "Fingerprint workflow run", url: latest.run_url });
  if (latest?.artifact_url) digestLinks.push({ label: "Fingerprint snapshot artifact", url: latest.artifact_url });

  const reportDelta = delta(current.total, previous.total);
  const fpAdded = Array.isArray(latest?.added) ? (latest!.added as string[]) : [];
  const fpRemoved = Array.isArray(latest?.removed) ? (latest!.removed as string[]) : [];
  const fpChanged = Array.isArray(latest?.changed) ? (latest!.changed as string[]) : [];

  const headline =
    `${current.total} CSP reports (${reportDelta.pct} vs last week), ` +
    `${newCombos.length} new directive/origin pairs, ` +
    `${fpAdded.length + fpChanged.length} fingerprint changes`;

  return {
    generatedAt: end,
    period: { start, end, previousStart },
    csp: {
      reports: reportDelta,
      criticalReports: delta(criticalNow, criticalBefore),
      combos: delta(current.combos.length, previous.combos.length),
      newCombos,
      topCombos: current.combos
        .slice()
        .sort((a, b) => b.total - a.total)
        .slice(0, 5)
        .map((c) => ({ directive: c.directive, blockedOrigin: c.blockedOrigin, total: c.total, surfaces: [...c.surfaces] })),
      readiness: {
        ready: current.readiness.ready,
        cleanDays: current.readiness.cleanDays,
        requiredCleanDays: current.readiness.requiredCleanDays,
        summary: current.readiness.summary,
      },
      enforced: cspEnforcementEnabled(),
    },
    fingerprint: {
      latest,
      previous: prevSnapshot,
      added: fpAdded,
      removed: fpRemoved,
      changed: fpChanged,
      signalCount: delta(latest?.signal_count ?? 0, prevSnapshot?.signal_count ?? 0),
    },
    links: digestLinks,
    headline,
  };
}

async function sendDigest(
  triggeredBy: string,
  options: { dryRun: boolean },
): Promise<Response> {
  const digest = await buildDigest();
  const deliveryError = options.dryRun ? "dry-run" : await dispatchSecurityDigest(digest);

  const { data, error } = await db()
    .from("security_digest_runs")
    .insert({
      period_start: digest.period.start,
      period_end: digest.period.end,
      triggered_by: triggeredBy,
      dry_run: options.dryRun,
      channels: deliveryError ? [] : ["slack", "email"],
      summary: {
        headline: digest.headline,
        csp: digest.csp,
        fingerprint: { added: digest.fingerprint.added, removed: digest.fingerprint.removed, changed: digest.fingerprint.changed },
        links: digest.links,
      },
      delivery_error: deliveryError,
    })
    .select("id, created_at")
    .single();
  if (error) return json({ error: error.message }, 500);

  return json({ ok: !deliveryError || options.dryRun, run: data, deliveryError, digest });
}

/* -------------------------------------------------------------- handler -- */

export const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: Record<string, unknown> = {};
  try {
    body = ((await req.json()) ?? {}) as Record<string, unknown>;
  } catch {
    body = {};
  }
  const action = str(body["action"], 30) ?? "preview";
  const actor = await adminUserId(req);
  const cron = hasCronKey(req);

  // `ingest` and `send` may run unattended; reads are admin-session only.
  const cronAllowed = action === "ingest" || action === "send";
  if (!actor && !(cron && cronAllowed)) {
    return json({ error: "Admin access required" }, 403);
  }

  try {
    switch (action) {
      case "ingest":
        return await ingestFingerprint(body);
      case "preview":
        return json(await buildDigest());
      case "send":
        return await sendDigest(actor ? `admin:${actor}` : "cron", { dryRun: body["dryRun"] === true });
      case "runs": {
        const { data, error } = await db()
          .from("security_digest_runs")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(20);
        if (error) return json({ error: error.message }, 500);
        return json({ runs: data ?? [] });
      }
      default:
        return json({ error: `Unknown action "${action}"` }, 400);
    }
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
};
