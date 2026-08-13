import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

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

export interface Finding {
  id: string;
  run_id: string;
  internal_id: string;
  scanner_name: string;
  level: string;
  title: string;
  description: string | null;
  entity: string | null;
  created_at: string;
}

export interface FindingIssue {
  internal_id: string;
  repo: string;
  issue_number: number;
  issue_url: string;
  created_at: string;
}

export interface DiffEntry {
  internal_id: string;
  status: "new" | "resolved" | "changed" | "unchanged";
  current: Finding | null;
  previous: Finding | null;
}

export interface ScanDiff {
  latest: ScanRun | null;
  previous: ScanRun | null;
  entries: DiffEntry[];
  counts: { new: number; resolved: number; changed: number; unchanged: number };
}

/**
 * All calls go through the `security-findings` edge function, which re-verifies
 * the JWT and admin role server-side. State-changing calls carry a single-use
 * CSRF token plus the custom `x-requested-with` header.
 */
async function call<T>(body: Record<string, unknown>, csrfToken?: string): Promise<T> {
  const { data, error } = await supabase.functions.invoke("security-findings", {
    body,
    headers: csrfToken
      ? { "x-csrf-token": csrfToken, "x-requested-with": "gradr-admin" }
      : undefined,
  });
  if (error) {
    const detail =
      typeof (error as { context?: { text?: () => Promise<string> } }).context?.text === "function"
        ? await (error as { context: { text: () => Promise<string> } }).context.text()
        : error.message;
    let message = detail;
    try {
      message = JSON.parse(detail).error ?? detail;
    } catch {
      /* plain text */
    }
    throw new Error(message);
  }
  return data as T;
}

/** Mint a fresh single-use CSRF token for the next privileged action. */
async function csrf(): Promise<string> {
  const { token } = await call<{ token: string }>({ action: "csrf" });
  return token;
}

export function useSecurityFindings(runId?: string) {
  return useQuery({
    queryKey: ["security-findings", runId ?? "latest"],
    queryFn: () =>
      call<{ runs: ScanRun[]; run_id: string | null; findings: Finding[]; issues: FindingIssue[] }>({
        action: "list",
        run_id: runId,
      }),
  });
}

export function useSecurityDiff(latestRunId?: string, previousRunId?: string) {
  return useQuery({
    queryKey: ["security-diff", latestRunId ?? "latest", previousRunId ?? "previous"],
    queryFn: () =>
      latestRunId && previousRunId
        ? call<ScanDiff>({ action: "diff_runs", latest_run_id: latestRunId, previous_run_id: previousRunId })
        : call<ScanDiff>({ action: "diff" }),
  });
}

export function useRunScan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => call<{ run: ScanRun }>({ action: "scan" }, await csrf()),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["security-findings"] });
      void qc.invalidateQueries({ queryKey: ["security-diff"] });
    },
  });
}

export function useSignedExport() {
  return useMutation({
    mutationFn: async (input: { format: "json" | "csv"; runId?: string | null; internalIds: string[] }) =>
      call<{ url: string; expires_at: string }>(
        {
          action: "sign_export",
          format: input.format,
          run_id: input.runId ?? null,
          internal_ids: input.internalIds,
        },
        await csrf(),
      ),
  });
}

export function useCreateGithubIssue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { repo: string; runId?: string | null; internalIds: string[] }) =>
      call<{ issue_url: string; issue_number: number; count: number }>(
        {
          action: "github_issue",
          repo: input.repo,
          run_id: input.runId ?? null,
          internal_ids: input.internalIds,
        },
        await csrf(),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["security-findings"] }),
  });
}
