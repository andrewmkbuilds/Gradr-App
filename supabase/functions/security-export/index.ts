/**
 * Signed, time-limited security findings download.
 *
 * The link carries a high-entropy token that is stored only as a SHA-256 hash,
 * is bound to the admin who minted it, expires after ten minutes and can be
 * redeemed exactly once. No session cookie is used, so there is nothing for a
 * cross-site request to ride on.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  adminClient,
  findingsToCsv,
  findingsToJson,
  sha256,
  type ScanRun,
  type StoredFinding,
} from "../_shared/securityScan.ts";
import { logSecurityEvent } from "../_shared/securityAudit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const token = new URL(req.url).searchParams.get("token") ?? "";
  if (!/^[a-f0-9]{64}$/.test(token)) {
    return new Response("Invalid download link", { status: 400, headers: corsHeaders });
  }

  const db = adminClient();
  const { data: row } = await db
    .from("security_export_tokens")
    .select("*")
    .eq("token_hash", await sha256(token))
    .maybeSingle();

  if (!row || row.used_at || new Date(row.expires_at).getTime() < Date.now()) {
    await logSecurityEvent({
      category: "entitlement_check",
      event: "security_export_download_denied",
      decision: "denied",
      source: "security-export",
      reason: !row ? "unknown_token" : row.used_at ? "already_used" : "expired",
    });
    return new Response("This download link has expired or was already used.", {
      status: 403,
      headers: corsHeaders,
    });
  }

  // Redeem first so a replayed request cannot download twice.
  await db.from("security_export_tokens").update({ used_at: new Date().toISOString() }).eq("id", row.id);

  const runId =
    row.run_id ??
    (
      await db
        .from("security_scan_runs")
        .select("id")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    ).data?.id;

  const { data: runRow } = await db.from("security_scan_runs").select("*").eq("id", runId).maybeSingle();
  let query = db.from("security_scan_findings").select("*").eq("run_id", runId);
  if (Array.isArray(row.internal_ids) && row.internal_ids.length) {
    query = query.in("internal_id", row.internal_ids);
  }
  const { data } = await query.order("internal_id", { ascending: true });
  const findings = (data ?? []) as StoredFinding[];
  const run = (runRow ?? null) as ScanRun | null;

  await logSecurityEvent({
    category: "entitlement_check",
    event: "security_export_downloaded",
    decision: "allowed",
    userId: row.admin_id,
    source: "security-export",
    details: { format: row.format, count: findings.length, run_id: runId },
  });

  const stamp = new Date().toISOString().slice(0, 10);
  const isCsv = row.format === "csv";
  return new Response(isCsv ? findingsToCsv(findings) : findingsToJson(run, findings), {
    headers: {
      ...corsHeaders,
      "Content-Type": isCsv ? "text/csv; charset=utf-8" : "application/json",
      "Content-Disposition": `attachment; filename="security-findings_${stamp}.${isCsv ? "csv" : "json"}"`,
      "Cache-Control": "no-store",
    },
  });
});
