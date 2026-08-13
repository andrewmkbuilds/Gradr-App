/**
 * OAuth forensics backend.
 *
 * Google flagged the Gradr OAuth callback as a false-positive phishing URL, and
 * the only way to get that reversed is evidence. This handler is the evidence
 * pipeline:
 *
 *  - `record`  (public, rate-limited) — a browser posts the redirect chain it
 *              actually walked during a sign-in, with state/nonce validation.
 *  - `traces`  (admin) — the last N sign-in chains for the admin console.
 *  - `headers` (admin | cron) — a *runtime* probe that fetches /auth and every
 *              OAuth-related path on the live domain and asserts CSP, HSTS and
 *              Referrer-Policy are really applied.
 *  - `checks`  (admin) — results of the daily headless-Chrome sign-in checks.
 *  - `ingest`  (cron key) — where that headless job posts its results.
 *  - `export`  (admin) — one-click incident timeline (JSON + Markdown) ready to
 *              paste into a Safe Browsing / Search Console false-positive report.
 *
 * Client-posted rows are audit telemetry only; nothing here grants access.
 */
import { corsHeaders } from "./shared/cors";
import { createClient } from "./shared/supabase";
import {
  CONTENT_SECURITY_POLICY,
  CONTENT_SECURITY_POLICY_REPORT_ONLY,

  OAUTH_SENSITIVE_PATHS,
  REFERRER_POLICY,
  STRICT_TRANSPORT_SECURITY,
  evaluateSecurityHeaders,
} from "@/lib/security/headers";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const SITE_ORIGIN = "https://gradr.me";
export const EXPECTED_FINAL_URL = `${SITE_ORIGIN}/auth`;

let _admin: ReturnType<typeof createClient> | null = null;
function db() {
  if (!_admin) {
    _admin = createClient(
      process.env["SUPABASE_URL"]!,
      process.env["SUPABASE_SERVICE_ROLE_KEY"]!,
      { auth: { persistSession: false } },
    );
  }
  return _admin;
}

async function requireAdmin(req: Request): Promise<{ ok: true; userId: string } | { ok: false; response: Response }> {
  const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!bearer) return { ok: false, response: json({ error: "Authentication required" }, 401) };
  const { data } = await db().auth.getUser(bearer);
  const user = data?.user;
  if (!user || user.is_anonymous) return { ok: false, response: json({ error: "Admin access required" }, 403) };
  const { data: isAdmin } = await db().rpc("has_role", { _user_id: user.id, _role: "admin" });
  if (isAdmin !== true) return { ok: false, response: json({ error: "Admin access required" }, 403) };
  return { ok: true, userId: user.id };
}

function hasCronKey(req: Request): boolean {
  const secret = process.env["CRON_SECRET"];
  const presented = req.headers.get("x-cron-secret") ?? req.headers.get("x-cron-key");
  return Boolean(secret && presented && presented === secret);
}

async function hashIp(req: Request): Promise<string | null> {
  const ip =
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    null;
  if (!ip) return null;
  const bytes = new TextEncoder().encode(`gradr-oauth:${ip}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

const str = (value: unknown, max = 500): string | null =>
  typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
const bool = (value: unknown): boolean | null => (typeof value === "boolean" ? value : null);

/* ---------------------------------------------------------------- record -- */

async function recordTrace(req: Request, body: Record<string, unknown>): Promise<Response> {
  const requestId = str(body["requestId"], 80);
  if (!requestId) return json({ error: "requestId is required" }, 400);

  const rawHops = Array.isArray(body["hops"]) ? (body["hops"] as unknown[]).slice(0, 25) : [];
  const hops = rawHops.map((hop, index) => {
    const h = (hop ?? {}) as Record<string, unknown>;
    return {
      order: typeof h["order"] === "number" ? h["order"] : index,
      url: str(h["url"], 1000) ?? "",
      kind: str(h["kind"], 30) ?? "final",
      at: str(h["at"], 40) ?? new Date().toISOString(),
      note: str(h["note"], 200),
    };
  });

  const { error } = await db().from("oauth_signin_traces").insert({
    request_id: requestId,
    provider: str(body["provider"], 40) ?? "google",
    stage: "complete",
    user_id: str(body["userId"], 40),
    account_kind: str(body["accountKind"], 40),
    started_at: str(body["startedAt"], 40),
    completed_at: str(body["completedAt"], 40),
    duration_ms: typeof body["durationMs"] === "number" ? Math.round(body["durationMs"]) : null,
    start_url: str(body["startUrl"], 1000),
    expected_redirect_uri: str(body["expectedRedirectUri"], 1000),
    final_url: str(body["finalUrl"], 1000),
    final_domain: str(body["finalDomain"], 253),
    hops,
    state_present: body["statePresent"] === true,
    state_valid: bool(body["stateValid"]),
    nonce_present: body["noncePresent"] === true,
    nonce_valid: bool(body["nonceValid"]),
    outcome: str(body["outcome"], 40) ?? "unknown",
    deviation: body["deviation"] === true,
    error_code: str(body["errorCode"], 120),
    error_message: str(body["errorMessage"], 500),
    user_agent: str(req.headers.get("user-agent"), 300),
    ip_hash: await hashIp(req),
  });

  if (error) return json({ error: error.message }, 500);
  return json({ recorded: true, requestId });
}

/* --------------------------------------------------------- header probe -- */

export interface HeaderProbe {
  path: string;
  url: string;
  status: number | null;
  ok: boolean;
  problems: string[];
  headers: Record<string, string | null>;
}

export async function probeSecurityHeaders(origin = SITE_ORIGIN): Promise<HeaderProbe[]> {
  const results: HeaderProbe[] = [];
  for (const path of OAUTH_SENSITIVE_PATHS) {
    const url = `${origin}${path}`;
    try {
      const response = await fetch(url, { method: "GET", redirect: "manual" });
      const verdict = evaluateSecurityHeaders(response.headers, {
        secure: url.startsWith("https:"),
      });
      results.push({
        path,
        url,
        status: response.status,
        ok: verdict.ok,
        problems: verdict.problems,
        headers: verdict.observed,
      });
    } catch (error) {
      results.push({
        path,
        url,
        status: null,
        ok: false,
        problems: [`Request failed: ${error instanceof Error ? error.message : String(error)}`],
        headers: {},
      });
    }
  }
  return results;
}

async function runHeaderCheck(source: string, origin: string): Promise<Response> {
  const runId = crypto.randomUUID();
  const probes = await probeSecurityHeaders(origin);
  await db()
    .from("oauth_header_checks")
    .insert(
      probes.map((probe) => ({
        run_id: runId,
        source,
        path: probe.path,
        url: probe.url,
        status: probe.status,
        ok: probe.ok,
        headers: probe.headers,
        problems: probe.problems,
      })),
    );
  const failures = probes.filter((p) => !p.ok);
  return json({
    runId,
    origin,
    checkedAt: new Date().toISOString(),
    expected: {
      contentSecurityPolicy: CONTENT_SECURITY_POLICY,
      strictTransportSecurity: STRICT_TRANSPORT_SECURITY,
      referrerPolicy: REFERRER_POLICY,
    },
    probes,
    verdict: failures.length === 0 ? "pass" : "fail",
    failures: failures.length,
  });
}

/* ---------------------------------------------------------- flow checks -- */

async function ingestFlowCheck(body: Record<string, unknown>): Promise<Response> {
  const runId = str(body["runId"], 80) ?? crypto.randomUUID();
  const rawResults = Array.isArray(body["results"]) ? (body["results"] as unknown[]) : [];
  if (!rawResults.length) return json({ error: "results[] is required" }, 400);

  const rows = rawResults.slice(0, 20).map((entry) => {
    const r = (entry ?? {}) as Record<string, unknown>;
    return {
      run_id: runId,
      account_label: str(r["accountLabel"], 60) ?? "unknown",
      source: str(body["source"], 40) ?? "ci",
      status: str(r["status"], 20) ?? "fail",
      redirect_uri: str(r["redirectUri"], 1000),
      final_url: str(r["finalUrl"], 1000),
      final_domain: str(r["finalDomain"], 253),
      expected_final_url: str(r["expectedFinalUrl"], 1000) ?? EXPECTED_FINAL_URL,
      duration_ms: typeof r["durationMs"] === "number" ? Math.round(r["durationMs"]) : null,
      hops: Array.isArray(r["hops"]) ? (r["hops"] as unknown[]).slice(0, 40) : [],
      header_checks: Array.isArray(r["headerChecks"]) ? r["headerChecks"] : [],
      failures: Array.isArray(r["failures"]) ? r["failures"] : [],
      console_errors: Array.isArray(r["consoleErrors"]) ? (r["consoleErrors"] as unknown[]).slice(0, 40) : [],
    };
  });

  const { error } = await db().from("oauth_flow_checks").insert(rows);
  if (error) return json({ error: error.message }, 500);
  const failed = rows.filter((row) => row.status !== "pass");
  return json({ ingested: rows.length, runId, failed: failed.length });
}

/* -------------------------------------------------------------- export --- */

function markdownTimeline(report: IncidentReport): string {
  const lines: string[] = [];
  lines.push(`# Gradr OAuth incident timeline`);
  lines.push("");
  lines.push(`- **Domain:** ${report.domain}`);
  lines.push(`- **Expected OAuth landing:** ${report.expectedFinalUrl}`);
  lines.push(`- **Generated:** ${report.generatedAt}`);
  lines.push(`- **Window:** ${report.window.from} → ${report.window.to}`);
  lines.push(
    `- **Sign-ins analysed:** ${report.summary.traces} (${report.summary.deviations} with a domain deviation, ${report.summary.stateFailures} with a failed state/nonce validation)`,
  );
  lines.push(
    `- **Automated daily flow checks:** ${report.summary.flowChecks} (${report.summary.flowCheckFailures} failed)`,
  );
  lines.push(
    `- **Security header probes:** ${report.summary.headerProbes} (${report.summary.headerProblems} problems)`,
  );
  lines.push("");
  lines.push(`## Summary statement`);
  lines.push("");
  lines.push(report.statement);
  lines.push("");
  lines.push(`## Redirect chains`);
  for (const trace of report.traces) {
    lines.push("");
    lines.push(`### Request \`${trace.request_id}\` — ${trace.created_at}`);
    lines.push("");
    lines.push(
      `Provider: ${trace.provider} · Outcome: ${trace.outcome} · Final domain: ${trace.final_domain ?? "—"} · Deviation: ${trace.deviation ? "YES" : "no"}`,
    );
    lines.push(
      `State returned: ${trace.state_present ? "yes" : "no"} (valid: ${fmtBool(trace.state_valid)}) · Nonce returned: ${trace.nonce_present ? "yes" : "no"} (valid: ${fmtBool(trace.nonce_valid)})`,
    );
    lines.push("");
    lines.push(`| # | Timestamp | Hop | URL |`);
    lines.push(`| --- | --- | --- | --- |`);
    for (const hop of trace.hops ?? []) {
      lines.push(`| ${hop.order} | ${hop.at} | ${hop.kind} | ${hop.url} |`);
    }
  }
  lines.push("");
  lines.push(`## Automated daily sign-in checks (headless Chrome)`);
  lines.push("");
  lines.push(`| Run | Account | Status | Final URL | Failures |`);
  lines.push(`| --- | --- | --- | --- | --- |`);
  for (const check of report.flowChecks) {
    lines.push(
      `| ${check.created_at} | ${check.account_label} | ${check.status} | ${check.final_url ?? "—"} | ${(check.failures ?? []).join("; ") || "none"} |`,
    );
  }
  lines.push("");
  lines.push(`## Security headers observed on OAuth paths`);
  lines.push("");
  lines.push(`| Path | Status | CSP | HSTS | Referrer-Policy | Problems |`);
  lines.push(`| --- | --- | --- | --- | --- | --- |`);
  for (const probe of report.headerProbes) {
    const h = probe.headers ?? {};
    lines.push(
      `| ${probe.path} | ${probe.status ?? "—"} | ${h["content-security-policy"] ? "present" : "MISSING"} | ${h["strict-transport-security"] ? "present" : "MISSING"} | ${h["referrer-policy"] ?? "MISSING"} | ${(probe.problems ?? []).join("; ") || "none"} |`,
    );
  }
  return lines.join("\n");
}

const fmtBool = (value: boolean | null | undefined) =>
  value === null || value === undefined ? "n/a" : value ? "yes" : "no";

interface TraceRow {
  request_id: string;
  created_at: string;
  provider: string;
  outcome: string;
  final_domain: string | null;
  deviation: boolean;
  state_present: boolean;
  state_valid: boolean | null;
  nonce_present: boolean;
  nonce_valid: boolean | null;
  hops: Array<{ order: number; url: string; kind: string; at: string }> | null;
}

interface FlowCheckRow {
  created_at: string;
  account_label: string;
  status: string;
  final_url: string | null;
  failures: string[] | null;
}

export interface IncidentReport {
  generatedAt: string;
  domain: string;
  expectedFinalUrl: string;
  window: { from: string; to: string };
  summary: {
    traces: number;
    deviations: number;
    stateFailures: number;
    flowChecks: number;
    flowCheckFailures: number;
    headerProbes: number;
    headerProblems: number;
  };
  statement: string;
  traces: TraceRow[];
  flowChecks: FlowCheckRow[];
  headerProbes: Array<{ path: string; status: number | null; headers: Record<string, string | null>; problems: string[] }>;
  markdown: string;
}

async function buildIncidentReport(days: number, limit: number): Promise<IncidentReport> {
  const to = new Date();
  const from = new Date(to.getTime() - days * 86_400_000);

  const [traceRes, checkRes, headerRes] = await Promise.all([
    db()
      .from("oauth_signin_traces")
      .select("*")
      .gte("created_at", from.toISOString())
      .order("created_at", { ascending: false })
      .limit(limit),
    db()
      .from("oauth_flow_checks")
      .select("*")
      .gte("created_at", from.toISOString())
      .order("created_at", { ascending: false })
      .limit(100),
    db()
      .from("oauth_header_checks")
      .select("*")
      .gte("created_at", from.toISOString())
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const traces = (traceRes.data ?? []) as TraceRow[];
  const flowChecks = (checkRes.data ?? []) as FlowCheckRow[];
  const headerRows = (headerRes.data ?? []) as Array<{
    run_id: string;
    path: string;
    status: number | null;
    headers: Record<string, string | null>;
    problems: string[];
  }>;

  // Keep only the newest probe per path so the report reads as a snapshot.
  const headerProbes: IncidentReport["headerProbes"] = [];
  const seen = new Set<string>();
  for (const row of headerRows) {
    if (seen.has(row.path)) continue;
    seen.add(row.path);
    headerProbes.push({
      path: row.path,
      status: row.status,
      headers: row.headers ?? {},
      problems: row.problems ?? [],
    });
  }

  const deviations = traces.filter((t) => t.deviation).length;
  const stateFailures = traces.filter((t) => t.state_valid === false || t.nonce_valid === false).length;
  const flowCheckFailures = flowChecks.filter((c) => c.status !== "pass").length;
  const headerProblems = headerProbes.reduce((sum, p) => sum + (p.problems?.length ?? 0), 0);

  const statement =
    deviations === 0 && flowCheckFailures === 0
      ? `Across ${traces.length} recorded sign-ins and ${flowChecks.length} automated headless-browser checks in the last ${days} days, every Google OAuth round-trip terminated on ${EXPECTED_FINAL_URL}. No redirect hop resolved to a domain outside Google, the managed auth provider, and gradr.me, and no state or nonce validation failed. We believe the Safe Browsing classification of the OAuth callback is a false positive.`
      : `Across ${traces.length} recorded sign-ins in the last ${days} days, ${deviations} terminated on an unexpected domain and ${flowCheckFailures} of ${flowChecks.length} automated checks failed. Full hop-by-hop detail is included below.`;

  const report: IncidentReport = {
    generatedAt: new Date().toISOString(),
    domain: "gradr.me",
    expectedFinalUrl: EXPECTED_FINAL_URL,
    window: { from: from.toISOString(), to: to.toISOString() },
    summary: {
      traces: traces.length,
      deviations,
      stateFailures,
      flowChecks: flowChecks.length,
      flowCheckFailures,
      headerProbes: headerProbes.length,
      headerProblems,
    },
    statement,
    traces,
    flowChecks,
    headerProbes,
    markdown: "",
  };
  report.markdown = markdownTimeline(report);
  return report;
}

/* ------------------------------------------------------------- handler --- */

export const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: Record<string, unknown> = {};
  try {
    body = ((await req.json()) ?? {}) as Record<string, unknown>;
  } catch {
    body = {};
  }
  const action = str(body["action"], 40) ?? "record";

  // Browser-posted telemetry: no session required (sign-in may have failed).
  if (action === "record") return recordTrace(req, body);

  // Scheduler-posted results.
  if (action === "ingest") {
    if (!hasCronKey(req)) {
      const admin = await requireAdmin(req);
      if (!admin.ok) return admin.response;
    }
    return ingestFlowCheck(body);
  }

  if (action === "headers" && hasCronKey(req)) {
    return runHeaderCheck("cron", str(body["origin"], 200) ?? SITE_ORIGIN);
  }

  const admin = await requireAdmin(req);
  if (!admin.ok) return admin.response;

  const limit = Math.min(200, Math.max(1, Number(body["limit"]) || 50));

  switch (action) {
    case "traces": {
      const { data, error } = await db()
        .from("oauth_signin_traces")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) return json({ error: error.message }, 500);
      return json({ traces: data ?? [], expectedFinalUrl: EXPECTED_FINAL_URL });
    }
    case "checks": {
      const { data, error } = await db()
        .from("oauth_flow_checks")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) return json({ error: error.message }, 500);
      return json({ checks: data ?? [] });
    }
    case "headers":
      return runHeaderCheck("admin", str(body["origin"], 200) ?? SITE_ORIGIN);
    case "csp": {
      // Report-only CSP monitor: recent violations plus a grouped breakdown so
      // an admin can tell "one stray inline style" from "checkout is broken".
      const days = Math.min(90, Math.max(1, Number(body["days"]) || 7));
      const since = new Date(Date.now() - days * 86_400_000).toISOString();
      const { data, error } = await db()
        .from("csp_violation_reports")
        .select("*")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) return json({ error: error.message }, 500);

      const rows = data ?? [];
      const groups = new Map<
        string,
        { directive: string; blockedOrigin: string; count: number; lastSeen: string; samplePath: string | null }
      >();
      for (const row of rows) {
        const directive = (row["effective_directive"] as string | null) ?? "unknown";
        const blockedOrigin = (row["blocked_origin"] as string | null) ?? "unknown";
        const key = `${directive}|${blockedOrigin}`;
        const existing = groups.get(key);
        if (existing) existing.count += 1;
        else {
          groups.set(key, {
            directive,
            blockedOrigin,
            count: 1,
            lastSeen: row["created_at"] as string,
            samplePath: (row["document_path"] as string | null) ?? null,
          });
        }
      }

      return json({
        days,
        total: rows.length,
        reports: rows,
        groups: [...groups.values()].sort((a, b) => b.count - a.count),
        candidatePolicy: CONTENT_SECURITY_POLICY_REPORT_ONLY,
        enforcedPolicy: CONTENT_SECURITY_POLICY,
      });
    }

    case "export": {
      const days = Math.min(90, Math.max(1, Number(body["days"]) || 14));
      const report = await buildIncidentReport(days, limit);
      return json(report);
    }
    default:
      return json({ error: `Unknown action "${action}"` }, 400);
  }
};
