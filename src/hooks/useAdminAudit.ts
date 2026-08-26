import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { adminRpc, adminRpcOrThrow, newRequestId, requestIdFor } from "@/lib/admin/adminRpc";

export type AuditResource = "affiliate_clicks" | "analytics_events";

export interface AuditEntry {
  id: string;
  actor_id: string | null;
  action: "view" | "create" | "update" | "delete" | "export";
  resource_type: string;
  resource_id: string | null;
  record_count: number;
  details: Record<string, unknown>;
  created_at: string;
}

/**
 * Record an admin read of sensitive tracking data.
 *
 * The RPC re-verifies the admin role server-side and de-duplicates repeat
 * views from the same actor within 30 seconds, so this is safe to call on
 * every mount without flooding the log.
 */
export async function logAdminView(resource: AuditResource, recordCount: number) {
  const { error } = await supabase.rpc("log_admin_access", {
    _action: "view",
    _resource_type: resource,
    _record_count: recordCount,
  });
  if (error) console.warn("[audit] view log failed", error.message);
}

export async function logAdminExport(resource: AuditResource, recordCount: number) {
  const { error } = await supabase.rpc("log_admin_access", {
    _action: "export",
    _resource_type: resource,
    _record_count: recordCount,
  });
  if (error) console.warn("[audit] export log failed", error.message);
}

/** Fire a view-audit entry once the given data set has loaded. */
export function useLogAdminView(
  resource: AuditResource,
  recordCount: number | undefined,
  enabled: boolean,
) {
  useEffect(() => {
    if (!enabled || recordCount === undefined) return;
    void logAdminView(resource, recordCount);
    // Intentionally keyed on resource/enabled only — server-side throttling
    // handles repeat calls, and we do not want a log per re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resource, enabled]);
}

export function useAdminAuditLog(filters: {
  resource: string;
  action: string;
  actorId: string;
  days: number;
}) {
  return useQuery({
    queryKey: ["adminAuditLog", filters],
    queryFn: async () => {
      const since = new Date(Date.now() - filters.days * 864e5).toISOString();
      let q = supabase
        .from("admin_audit_log")
        .select("*")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(500);

      if (filters.resource !== "all") q = q.eq("resource_type", filters.resource);
      if (filters.action !== "all") q = q.eq("action", filters.action);
      if (filters.actorId !== "all") q = q.eq("actor_id", filters.actorId);

      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as unknown as AuditEntry[];
    },
  });
}

export function useAuditActors() {
  return useQuery({
    queryKey: ["adminAuditActors"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await adminRpc<{ user_id: string; display_name: string | null }[]>(
        "admin_audit_actors",
        undefined,
        { requestId: requestIdFor("admin_audit_actors", "all") },
      );
      if (error) return [] as { user_id: string; display_name: string | null }[];
      return data || [];
    },
  });
}

/* ------------------------------------------------------------------ *
 * Admin RPC audit
 *
 * Every `public.admin_*` routine begins with `PERFORM
 * public.admin_rpc_guard('<name>')`, which re-checks the admin role, throttles
 * the caller and writes one row per invocation to `admin_rpc_audit`
 * (who / when / which function / request id / outcome). The table is
 * admin-read-only and has no insert policy — only the SECURITY DEFINER guard
 * writes to it.
 * ------------------------------------------------------------------ */

export type AdminRpcStatus = "ok" | "denied" | "rate_limited";

export interface AdminRpcAuditEntry {
  id: string;
  actor_id: string | null;
  function_name: string;
  request_id: string | null;
  status: AdminRpcStatus;
  ip: string | null;
  user_agent: string | null;
  details: Record<string, unknown>;
  created_at: string;
}

export function useAdminRpcAudit(filters: {
  fn: string;
  status: string;
  actorId: string;
  days: number;
  /** Debounced free-text match across function name, request id and user agent. */
  search?: string;
  /** Inclusive calendar-day bounds; override the rolling `days` window. */
  from?: string;
  to?: string;
}) {
  return useQuery({
    queryKey: ["adminRpcAudit", filters],
    queryFn: async () => {
      const since = filters.from
        ? new Date(`${filters.from}T00:00:00`).toISOString()
        : new Date(Date.now() - filters.days * 864e5).toISOString();

      let q = supabase
        .from("admin_rpc_audit")
        .select("*")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(500);

      if (filters.to) q = q.lte("created_at", new Date(`${filters.to}T23:59:59.999`).toISOString());
      if (filters.fn !== "all") q = q.eq("function_name", filters.fn);
      if (filters.status !== "all") q = q.eq("status", filters.status);
      if (filters.actorId !== "all") q = q.eq("actor_id", filters.actorId);
      if (filters.search?.trim()) {
        // Commas and % would break PostgREST's `or` grammar / LIKE semantics.
        const term = `%${filters.search.trim().replace(/[%,]/g, "")}%`;
        q = q.or(
          `function_name.ilike.${term},request_id.ilike.${term},user_agent.ilike.${term}`,
        );
      }

      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as unknown as AdminRpcAuditEntry[];
    },
  });
}


/* ------------------------------------------------------------------ *
 * Retention & archival
 *
 * `admin_rpc_audit` is written on every admin RPC, so it grows fast. A nightly
 * job moves rows past the live window into `admin_rpc_audit_archive` (or
 * deletes them when archiving is off) and prunes the archive past its own
 * window. Admins can change the windows and run the sweep on demand.
 * ------------------------------------------------------------------ */

export interface RpcAuditRetention {
  retention_days: number;
  archive_enabled: boolean;
  archive_retention_days: number;
  purge_enabled: boolean;
  last_purge_at: string | null;
  last_purge_result: Record<string, unknown> | null;
}

export function useRpcAuditRetention(enabled: boolean) {
  return useQuery({
    queryKey: ["adminRpcAuditRetention"],
    enabled,
    queryFn: async () => {
      const data = await adminRpcOrThrow<RpcAuditRetention>(
        "admin_rpc_audit_retention_settings",
        undefined,
        { requestId: requestIdFor("admin_rpc_audit_retention_settings", "singleton") },
      );
      return data;
    },
  });
}

export function useUpdateRpcAuditRetention() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      retentionDays: number;
      archiveEnabled: boolean;
      archiveRetentionDays: number;
      purgeEnabled: boolean;
    }) =>
      adminRpcOrThrow<RpcAuditRetention>(
        "admin_update_rpc_audit_retention",
        {
          _retention_days: input.retentionDays,
          _archive_enabled: input.archiveEnabled,
          _archive_retention_days: input.archiveRetentionDays,
          _purge_enabled: input.purgeEnabled,
        },
        { requestId: newRequestId("update-rpc-audit-retention") },
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["adminRpcAuditRetention"] });
    },
  });
}

export function useRunRpcAuditPurge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      adminRpcOrThrow<Record<string, unknown>>("admin_run_rpc_audit_purge", undefined, {
        requestId: newRequestId("run-rpc-audit-purge"),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["adminRpcAuditRetention"] });
      void qc.invalidateQueries({ queryKey: ["adminRpcAudit"] });
    },
  });
}
