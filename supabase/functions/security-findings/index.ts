/**
 * Admin security findings gateway.
 *
 * Every action re-verifies the caller's JWT server-side and requires the
 * `admin` role (RLS is not the only boundary here). State-changing actions —
 * running a scan, opening a GitHub issue, minting a signed download link —
 * additionally require:
 *   1. a same-origin `Origin` header from an allowed app origin,
 *   2. the custom `x-requested-with: gradr-admin` header (blocks simple
 *      cross-site form posts, which cannot set custom headers), and
 *   3. a single-use CSRF token minted by the `csrf` action for this admin.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import {
  adminClient,
  diffFindings,
  findingsToCsv,
  findingsToJson,
  latestDiff,
  randomToken,
  runScan,
  sha256,
  type ScanRun,
  type StoredFinding,
} from "../_shared/securityScan.ts";
import { logSecurityEvent } from "../_shared/securityAudit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-csrf-token, x-requested-with",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ALLOWED_ORIGINS = [
  "https://gradr.me",
  "https://www.gradr.me",
  "https://gradr-app.lovable.app",
  "http://localhost:8080",
];

const CSRF_TTL_MS = 15 * 60 * 1000;
const EXPORT_TTL_MS = 10 * 60 * 1000;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Resolve + authorise the caller. Returns the admin's user id or throws. */
async function requireAdmin(req: Request): Promise<string> {
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) throw new HttpError(401, "Missing bearer token");

  const anon = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: userData, error } = await anon.auth.getUser();
  const user = userData?.user;
  if (error || !user) throw new HttpError(401, "Invalid session");
  if (user.is_anonymous) throw new HttpError(403, "Anonymous sessions cannot access admin tools");

  const db = adminClient();
  const { data: role } = await db
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "admin")
    .maybeSingle();
  if (!role) {
    await logSecurityEvent({
      category: "entitlement_check",
      event: "security_findings_admin_denied",
      decision: "denied",
      userId: user.id,
      source: "security-findings",
    });
    throw new HttpError(403, "Admin role required");
  }
  return user.id;
}

class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

/** CSRF + origin checks for state-changing actions. */
async function requireCsrf(req: Request, adminId: string) {
  const origin = req.headers.get("Origin");
  if (origin && !ALLOWED_ORIGINS.includes(origin)) throw new HttpError(403, "Origin not allowed");
  if (req.headers.get("x-requested-with") !== "gradr-admin") {
    throw new HttpError(403, "Missing x-requested-with header");
  }
  const token = req.headers.get("x-csrf-token");
  if (!token) throw new HttpError(403, "Missing CSRF token");

  const db = adminClient();
  const hash = await sha256(token);
  const { data: row } = await db
    .from("admin_csrf_tokens")
    .select("id, admin_id, expires_at")
    .eq("token_hash", hash)
    .maybeSingle();
  if (!row || row.admin_id !== adminId || new Date(row.expires_at).getTime() < Date.now()) {
    throw new HttpError(403, "Invalid or expired CSRF token");
  }
  // Single use.
  await db.from("admin_csrf_tokens").delete().eq("id", row.id);
}

async function loadFindings(runId: string): Promise<StoredFinding[]> {
  const db = adminClient();
  const { data } = await db
    .from("security_scan_findings")
    .select("*")
    .eq("run_id", runId)
    .order("level", { ascending: true })
    .order("internal_id", { ascending: true });
  return (data ?? []) as StoredFinding[];
}

/** Create a GitHub issue, preferring the connector gateway when configured. */
async function githubRequest(path: string, body: unknown) {
  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  const connectionKey = Deno.env.get("GITHUB_API_KEY");
  const pat = Deno.env.get("GITHUB_TOKEN");

  if (lovableKey && connectionKey) {
    return await fetch(`https://connector-gateway.lovable.dev/github/${path}`, {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": connectionKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  }
  if (pat) {
    return await fetch(`https://api.github.com/${path}`, {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${pat}`,
        "Content-Type": "application/json",
        "User-Agent": "gradr-security-bot",
      },
      body: JSON.stringify(body),
    });
  }
  throw new HttpError(
    503,
    "GitHub is not connected. Link the GitHub connector or set a GITHUB_TOKEN secret.",
  );
}

function issueBody(
  run: ScanRun | null,
  findings: StoredFinding[],
  jsonAttachment: string,
  csvAttachment: string,
) {
  const commit = run?.commit_sha
    ? `- Commit: ${run.commit_url ? `[${run.commit_sha.slice(0, 8)}](${run.commit_url})` : run.commit_sha}\n- Ref: ${run.commit_ref ?? "unknown"}\n`
    : "- Commit: not recorded for this scan\n";

  const table = [
    "| internal_id | level | title | entity |",
    "| --- | --- | --- | --- |",
    ...findings.map(
      (f) => `| \`${f.internal_id}\` | ${f.level} | ${f.title.replace(/\|/g, "\\|")} | \`${f.entity ?? ""}\` |`,
    ),
  ].join("\n");

  return [
    `Automated security finding report from the Gradr admin Security Findings console.`,
    "",
    "### Scan metadata",
    `- Scan run: \`${run?.id ?? "unknown"}\``,
    `- Triggered by: ${run?.trigger ?? "unknown"}`,
    `- Finished: ${run?.finished_at ?? "unknown"}`,
    commit.trimEnd(),
    "",
    `### Findings (${findings.length})`,
    table,
    "",
    "<details><summary>findings.json</summary>",
    "",
    "```json",
    jsonAttachment,
    "```",
    "",
    "</details>",
    "",
    "<details><summary>findings.csv</summary>",
    "",
    "```csv",
    csvAttachment,
    "```",
    "",
    "</details>",
  ].join("\n");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const adminId = await requireAdmin(req);
    const payload = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const action = String(payload.action ?? "list");
    const db = adminClient();

    if (action === "csrf") {
      const token = randomToken();
      await db.from("admin_csrf_tokens").insert({
        token_hash: await sha256(token),
        admin_id: adminId,
        expires_at: new Date(Date.now() + CSRF_TTL_MS).toISOString(),
      });
      return json({ token, expires_in: CSRF_TTL_MS / 1000 });
    }

    if (action === "list") {
      const { data: runs } = await db
        .from("security_scan_runs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);
      const runList = (runs ?? []) as ScanRun[];
      const runId = String(payload.run_id ?? runList[0]?.id ?? "");
      const findings = runId ? await loadFindings(runId) : [];
      const { data: issues } = await db.from("security_finding_issues").select("*");
      return json({ runs: runList, run_id: runId || null, findings, issues: issues ?? [] });
    }

    if (action === "diff") {
      return json(await latestDiff(db));
    }

    if (action === "diff_runs") {
      const [latestId, previousId] = [String(payload.latest_run_id ?? ""), String(payload.previous_run_id ?? "")];
      const { data: runs } = await db
        .from("security_scan_runs")
        .select("*")
        .in("id", [latestId, previousId].filter(Boolean));
      const byId = new Map(((runs ?? []) as ScanRun[]).map((r) => [r.id, r]));
      const latest = byId.get(latestId) ?? null;
      const previous = byId.get(previousId) ?? null;
      return json(
        diffFindings(
          latest,
          previous,
          latest ? await loadFindings(latest.id) : [],
          previous ? await loadFindings(previous.id) : [],
        ),
      );
    }

    // ---- state-changing actions below ----
    await requireCsrf(req, adminId);

    if (action === "scan") {
      const { run, findings } = await runScan(db, {
        trigger: "manual",
        createdBy: adminId,
        commit: payload.commit ?? {},
      });
      await logSecurityEvent({
        category: "entitlement_check",
        event: "security_scan_run",
        decision: "processed",
        userId: adminId,
        source: "security-findings",
        details: { run_id: run.id, totals: run.totals },
      });
      return json({ run, findings });
    }

    if (action === "sign_export") {
      const format = payload.format === "csv" ? "csv" : "json";
      const internalIds: string[] = Array.isArray(payload.internal_ids)
        ? payload.internal_ids.map(String)
        : [];
      const runId = payload.run_id ? String(payload.run_id) : null;
      const token = randomToken();
      await db.from("security_export_tokens").insert({
        token_hash: await sha256(token),
        admin_id: adminId,
        format,
        run_id: runId,
        internal_ids: internalIds,
        expires_at: new Date(Date.now() + EXPORT_TTL_MS).toISOString(),
      });
      const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/security-export?token=${token}`;
      await logSecurityEvent({
        category: "entitlement_check",
        event: "security_export_link_minted",
        decision: "allowed",
        userId: adminId,
        source: "security-findings",
        details: { format, count: internalIds.length, run_id: runId },
      });
      return json({ url, expires_at: new Date(Date.now() + EXPORT_TTL_MS).toISOString(), format });
    }

    if (action === "github_issue") {
      const internalIds: string[] = Array.isArray(payload.internal_ids)
        ? payload.internal_ids.map(String)
        : [];
      if (!internalIds.length) throw new HttpError(400, "Select at least one finding");
      const repo = String(payload.repo ?? Deno.env.get("GITHUB_REPO") ?? "").trim();
      if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) {
        throw new HttpError(400, "Provide a repository as owner/name");
      }

      const runId = payload.run_id ? String(payload.run_id) : null;
      const { data: runRow } = runId
        ? await db.from("security_scan_runs").select("*").eq("id", runId).maybeSingle()
        : await db
            .from("security_scan_runs")
            .select("*")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
      const run = (runRow ?? null) as ScanRun | null;
      if (!run) throw new HttpError(400, "No scan run available");

      const all = await loadFindings(run.id);
      const selected = all.filter((f) => internalIds.includes(f.internal_id));
      if (!selected.length) throw new HttpError(404, "No matching findings in that run");

      const title =
        selected.length === 1
          ? `[security] ${selected[0].title} (${selected[0].internal_id})`
          : `[security] ${selected.length} findings from scan ${run.id.slice(0, 8)}`;

      const res = await githubRequest(`repos/${repo}/issues`, {
        title,
        body: issueBody(run, selected, findingsToJson(run, selected), findingsToCsv(selected)),
        labels: ["security", "automated"],
      });
      if (!res.ok) {
        const text = await res.text();
        console.error(`[security-findings] GitHub issue failed [${res.status}]: ${text}`);
        return json({ error: "GitHub request failed", status: res.status, details: text }, res.status);
      }
      const issue = await res.json();

      await db.from("security_finding_issues").upsert(
        selected.map((f) => ({
          internal_id: f.internal_id,
          run_id: run.id,
          repo,
          issue_number: issue.number,
          issue_url: issue.html_url,
          commit_sha: run.commit_sha,
          created_by: adminId,
        })),
        { onConflict: "repo,internal_id" },
      );

      await logSecurityEvent({
        category: "entitlement_check",
        event: "security_github_issue_created",
        decision: "processed",
        userId: adminId,
        source: "security-findings",
        details: { repo, issue: issue.number, internal_ids: internalIds },
      });

      return json({ issue_url: issue.html_url, issue_number: issue.number, repo, count: selected.length });
    }

    throw new HttpError(400, `Unknown action: ${action}`);
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    const message = e instanceof Error ? e.message : "Unexpected error";
    if (status >= 500) console.error("[security-findings]", e);
    return json({ error: message }, status);
  }
});
