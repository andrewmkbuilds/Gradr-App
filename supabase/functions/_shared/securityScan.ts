/**
 * Shared security-scan engine.
 *
 * Runs the server-only `security_scan_snapshot()` database routine, stores the
 * result as an immutable scan run, and provides diffing + serialisation helpers
 * used by the admin UI, the export endpoints and the scheduled Slack job.
 */
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

export interface RawFinding {
  internal_id: string;
  level: string;
  title: string;
  description: string;
  entity: string;
}

export interface StoredFinding extends RawFinding {
  id: string;
  run_id: string;
  scanner_name: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface ScanRun {
  id: string;
  source: string;
  trigger: string;
  started_at: string;
  finished_at: string | null;
  commit_sha: string | null;
  commit_ref: string | null;
  commit_url: string | null;
  totals: Record<string, number>;
  created_at: string;
}

export interface CommitMeta {
  sha?: string | null;
  ref?: string | null;
  url?: string | null;
}

export function adminClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

export function envCommit(): CommitMeta {
  return {
    sha: Deno.env.get("GRADR_COMMIT_SHA") ?? null,
    ref: Deno.env.get("GRADR_COMMIT_REF") ?? null,
    url: Deno.env.get("GRADR_COMMIT_URL") ?? null,
  };
}

const LEVELS = ["error", "warning", "info"] as const;

export function totalsOf(findings: RawFinding[]): Record<string, number> {
  const totals: Record<string, number> = { total: findings.length };
  for (const level of LEVELS) totals[level] = findings.filter((f) => f.level === level).length;
  return totals;
}

/** Execute a scan and persist it as a new immutable run. */
export async function runScan(
  db: SupabaseClient,
  opts: { trigger: string; commit?: CommitMeta; createdBy?: string | null },
): Promise<{ run: ScanRun; findings: StoredFinding[] }> {
  const startedAt = new Date().toISOString();
  const { data, error } = await db.rpc("security_scan_snapshot");
  if (error) throw new Error(`scan failed: ${error.message}`);
  const raw = (data ?? []) as RawFinding[];

  const commit = { ...envCommit(), ...(opts.commit ?? {}) };
  const { data: run, error: runErr } = await db
    .from("security_scan_runs")
    .insert({
      source: "gradr_internal",
      trigger: opts.trigger,
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      commit_sha: commit.sha ?? null,
      commit_ref: commit.ref ?? null,
      commit_url: commit.url ?? null,
      totals: totalsOf(raw),
      // Legacy columns kept in sync so older readers of this table stay correct.
      finding_count: raw.length,
      internal_ids: raw.map((f) => f.internal_id),
      counts_by_level: totalsOf(raw),
      findings: raw,
      branch: commit.ref ?? null,
      created_by: opts.createdBy ?? null,
    })
    .select("*")
    .single();
  if (runErr) throw new Error(`could not store run: ${runErr.message}`);

  let findings: StoredFinding[] = [];
  if (raw.length) {
    const { data: inserted, error: fErr } = await db
      .from("security_scan_findings")
      .insert(
        raw.map((f) => ({
          run_id: (run as ScanRun).id,
          internal_id: f.internal_id,
          scanner_name: "gradr_internal",
          level: f.level,
          title: f.title,
          description: f.description,
          entity: f.entity,
          fingerprint: `${f.internal_id}|${f.level}|${f.title}`,
        })),
      )
      .select("*");
    if (fErr) throw new Error(`could not store findings: ${fErr.message}`);
    findings = (inserted ?? []) as StoredFinding[];
  }

  return { run: run as ScanRun, findings };
}

export interface DiffEntry {
  internal_id: string;
  status: "new" | "resolved" | "changed" | "unchanged";
  current: StoredFinding | null;
  previous: StoredFinding | null;
}

export interface ScanDiff {
  latest: ScanRun | null;
  previous: ScanRun | null;
  entries: DiffEntry[];
  counts: { new: number; resolved: number; changed: number; unchanged: number };
}

export function diffFindings(
  latest: ScanRun | null,
  previous: ScanRun | null,
  current: StoredFinding[],
  prior: StoredFinding[],
): ScanDiff {
  const cur = new Map(current.map((f) => [f.internal_id, f]));
  const pre = new Map(prior.map((f) => [f.internal_id, f]));
  const ids = [...new Set([...cur.keys(), ...pre.keys()])].sort();

  const entries: DiffEntry[] = ids.map((id) => {
    const c = cur.get(id) ?? null;
    const p = pre.get(id) ?? null;
    let status: DiffEntry["status"] = "unchanged";
    if (c && !p) status = "new";
    else if (!c && p) status = "resolved";
    else if (c && p && (c.level !== p.level || c.title !== p.title || c.description !== p.description)) {
      status = "changed";
    }
    return { internal_id: id, status, current: c, previous: p };
  });

  const counts = { new: 0, resolved: 0, changed: 0, unchanged: 0 };
  for (const e of entries) counts[e.status] += 1;
  return { latest, previous, entries, counts };
}

/** Load the two most recent runs and diff them. */
export async function latestDiff(db: SupabaseClient): Promise<ScanDiff> {
  const { data: runs, error } = await db
    .from("security_scan_runs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(2);
  if (error) throw new Error(error.message);
  const [latest = null, previous = null] = (runs ?? []) as ScanRun[];

  const load = async (run: ScanRun | null) => {
    if (!run) return [] as StoredFinding[];
    const { data } = await db.from("security_scan_findings").select("*").eq("run_id", run.id);
    return (data ?? []) as StoredFinding[];
  };

  return diffFindings(latest, previous, await load(latest), await load(previous));
}

const CSV_COLUMNS = [
  "internal_id",
  "level",
  "title",
  "description",
  "entity",
  "scanner_name",
  "run_id",
  "created_at",
] as const;

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '""';
  const raw = typeof value === "object" ? JSON.stringify(value) : String(value);
  const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function findingsToCsv(findings: StoredFinding[]): string {
  const header = CSV_COLUMNS.map(csvCell).join(",");
  const rows = findings.map((f) =>
    CSV_COLUMNS.map((c) => csvCell((f as unknown as Record<string, unknown>)[c])).join(","),
  );
  return [header, ...rows].join("\n");
}

export function findingsToJson(run: ScanRun | null, findings: StoredFinding[]): string {
  return JSON.stringify(
    {
      exported_at: new Date().toISOString(),
      run: run
        ? {
            id: run.id,
            trigger: run.trigger,
            started_at: run.started_at,
            finished_at: run.finished_at,
            totals: run.totals,
            commit: { sha: run.commit_sha, ref: run.commit_ref, url: run.commit_url },
          }
        : null,
      count: findings.length,
      findings,
    },
    null,
    2,
  );
}

/** SHA-256 hex digest — used so raw tokens are never stored at rest. */
export async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function randomToken(bytes = 32): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return [...buf].map((b) => b.toString(16).padStart(2, "0")).join("");
}
