import { supabase } from "@/integrations/supabase/client";
import type { RpcAuditFilters } from "./auditPresets";

/**
 * Streamed CSV export for `admin_rpc_audit`.
 *
 * The on-screen table is capped at 500 rows; an export is not. Selecting a
 * month of audit rows in one request is how you get a PostgREST statement
 * timeout and a browser holding tens of MB of row objects at once. Instead we
 * page through the table and push each page into a `ReadableStream` as encoded
 * CSV text, so at most one page of rows is alive at a time and the browser (not
 * this module) accumulates the bytes.
 */

const PAGE_SIZE = 1000;
/** Hard stop so an unfiltered export cannot run forever. */
const MAX_ROWS = 200_000;

/** RFC4180-safe cell: quote everything, double embedded quotes. */
const csvCell = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;

export const CSV_HEADERS = [
  "When",
  "Actor id",
  "Actor",
  "Function",
  "Outcome",
  "Request id",
  "IP",
  "User agent",
] as const;

export interface StreamExportOptions {
  filters: RpcAuditFilters;
  /** days window fallback when no explicit from/to date is set */
  days: number;
  actorName: Map<string, string>;
  onProgress?: (rows: number) => void;
  signal?: AbortSignal;
}

interface AuditRow {
  created_at: string;
  actor_id: string | null;
  function_name: string;
  status: string;
  request_id: string | null;
  ip: string | null;
  user_agent: string | null;
}

export function auditRangeFor(filters: RpcAuditFilters, days: number) {
  const since = filters.from
    ? new Date(`${filters.from}T00:00:00`).toISOString()
    : new Date(Date.now() - days * 864e5).toISOString();
  // `to` is an inclusive calendar day, so the upper bound is the day's end.
  const until = filters.to ? new Date(`${filters.to}T23:59:59.999`).toISOString() : null;
  return { since, until };
}

function applyFilters<T>(query: T, filters: RpcAuditFilters, days: number): T {
  const { since, until } = auditRangeFor(filters, days);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = (query as any).gte("created_at", since);
  if (until) q = q.lte("created_at", until);
  if (filters.fn !== "all") q = q.eq("function_name", filters.fn);
  if (filters.status !== "all") q = q.eq("status", filters.status);
  if (filters.actorId !== "all") q = q.eq("actor_id", filters.actorId);
  if (filters.search.trim()) {
    const term = `%${filters.search.trim().replace(/[%,]/g, "")}%`;
    q = q.or(
      `function_name.ilike.${term},request_id.ilike.${term},user_agent.ilike.${term}`,
    );
  }
  return q as T;
}

/** Client-side row filter mirroring the server `or()` search, for the table. */
export function matchesSearch(
  row: { function_name: string; request_id: string | null; user_agent: string | null },
  search: string,
): boolean {
  const term = search.trim().toLowerCase();
  if (!term) return true;
  return [row.function_name, row.request_id, row.user_agent].some((v) =>
    (v || "").toLowerCase().includes(term),
  );
}

function rowToCsv(row: AuditRow, actorName: Map<string, string>): string {
  return (
    [
      row.created_at ? new Date(row.created_at).toISOString().replace("T", " ").slice(0, 19) : "",
      row.actor_id ?? "",
      row.actor_id ? actorName.get(row.actor_id) ?? "" : "anonymous",
      row.function_name,
      row.status,
      row.request_id ?? "",
      row.ip ?? "",
      row.user_agent ?? "",
    ]
      .map(csvCell)
      .join(",") + "\r\n"
  );
}

/**
 * Build the export as a stream and hand back a Blob URL. Returns the row count
 * so the caller can report it (and log an export audit entry).
 */
export async function streamAuditCsv(options: StreamExportOptions): Promise<{
  blob: Blob;
  rows: number;
}> {
  const { filters, days, actorName, onProgress, signal } = options;
  const encoder = new TextEncoder();
  let total = 0;

  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        if (signal?.aborted) {
          controller.close();
          return;
        }

        if (total === 0) {
          // BOM keeps Excel from mangling UTF-8 function names / user agents.
          controller.enqueue(encoder.encode("\uFEFF"));
          controller.enqueue(encoder.encode(CSV_HEADERS.map(csvCell).join(",") + "\r\n"));
        }

        const query = applyFilters(
          supabase
            .from("admin_rpc_audit")
            .select("created_at,actor_id,function_name,status,request_id,ip,user_agent"),
          filters,
          days,
        )
          .order("created_at", { ascending: false })
          .range(total, total + PAGE_SIZE - 1);

        const { data, error } = await query;
        if (error) throw new Error(error.message);

        const page = (data || []) as unknown as AuditRow[];
        if (page.length > 0) {
          // One page of text at a time — the row objects go out of scope with
          // this closure rather than piling up in an array.
          controller.enqueue(
            encoder.encode(page.map((r) => rowToCsv(r, actorName)).join("")),
          );
          total += page.length;
          onProgress?.(total);
        }

        if (page.length < PAGE_SIZE || total >= MAX_ROWS) controller.close();
      } catch (e) {
        controller.error(e);
      }
    },
  });

  const blob = await new Response(stream).blob();
  return { blob: new Blob([blob], { type: "text/csv;charset=utf-8" }), rows: total };
}

/** Triggers the browser download for a completed export. */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
