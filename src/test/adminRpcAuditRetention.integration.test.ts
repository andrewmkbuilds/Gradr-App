import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Retention / archival sweep integration test.
 *
 * Seeds throwaway `admin_rpc_audit` rows on both sides of the live window,
 * runs `public.purge_admin_rpc_audit()`, and asserts that:
 *   - rows older than the live window leave `admin_rpc_audit`,
 *   - archiving is on -> they land in `admin_rpc_audit_archive`,
 *   - rows inside the window are untouched,
 *   - rows past the archive window are pruned from the archive too.
 *
 * Needs the service role (the purge routine is service-role only), so it is
 * opt-in: RUN_DB_TESTS=1 plus SUPABASE_SERVICE_ROLE_KEY. Everything it writes
 * is tagged with a unique marker and removed afterwards, so it never touches
 * real audit history.
 */
const enabled = process.env.RUN_DB_TESTS === "1";
const url = process.env.VITE_SUPABASE_URL ?? import.meta.env?.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const admin: SupabaseClient | null =
  enabled && url && serviceKey
    ? createClient(url, serviceKey, { auth: { persistSession: false } })
    : null;

const MARKER = `retention-test-${Date.now()}`;
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

/** Snapshot of the live policy so the test can restore it. */
let saved: Record<string, unknown> | null = null;

describe.skipIf(!admin)("admin_rpc_audit retention sweep", () => {
  beforeAll(async () => {
    const { data } = await admin!
      .from("admin_rpc_audit_retention")
      .select("retention_days, archive_enabled, archive_retention_days, purge_enabled")
      .maybeSingle();
    saved = data ?? null;

    await admin!
      .from("admin_rpc_audit_retention")
      .update({
        retention_days: 30,
        archive_enabled: true,
        archive_retention_days: 180,
        purge_enabled: true,
      })
      .eq("id", true);
  });

  afterAll(async () => {
    if (!admin) return;
    await admin.from("admin_rpc_audit").delete().eq("request_id", MARKER);
    await admin.from("admin_rpc_audit_archive").delete().eq("request_id", MARKER);
    if (saved) {
      await admin.from("admin_rpc_audit_retention").update(saved).eq("id", true);
    }
  });

  it("archives expired rows, keeps fresh ones, prunes the archive", async () => {
    const seed = [
      { function_name: "retention_probe_old", status: "ok", created_at: daysAgo(120) },
      { function_name: "retention_probe_old2", status: "denied", created_at: daysAgo(45) },
      { function_name: "retention_probe_fresh", status: "ok", created_at: daysAgo(1) },
    ].map((row) => ({ ...row, request_id: MARKER, details: {} }));

    const { error: seedError } = await admin!.from("admin_rpc_audit").insert(seed);
    expect(seedError, seedError?.message).toBeNull();

    // A stale archive row that must be pruned by the archive window.
    const { error: archiveSeedError } = await admin!.from("admin_rpc_audit_archive").insert({
      id: crypto.randomUUID(),
      function_name: "retention_probe_archived",
      status: "ok",
      request_id: MARKER,
      details: {},
      created_at: daysAgo(400),
    });
    expect(archiveSeedError, archiveSeedError?.message).toBeNull();

    const { data: result, error: purgeError } = await admin!.rpc("purge_admin_rpc_audit");
    expect(purgeError, purgeError?.message).toBeNull();
    expect((result as { skipped?: boolean } | null)?.skipped).toBeFalsy();

    const { data: live } = await admin!
      .from("admin_rpc_audit")
      .select("function_name")
      .eq("request_id", MARKER);
    const liveNames = (live ?? []).map((r: { function_name: string }) => r.function_name);
    expect(liveNames).toContain("retention_probe_fresh");
    expect(liveNames).not.toContain("retention_probe_old");
    expect(liveNames).not.toContain("retention_probe_old2");

    const { data: archived } = await admin!
      .from("admin_rpc_audit_archive")
      .select("function_name")
      .eq("request_id", MARKER);
    const archivedNames = (archived ?? []).map((r: { function_name: string }) => r.function_name);
    expect(archivedNames).toContain("retention_probe_old");
    expect(archivedNames).toContain("retention_probe_old2");
    // Past the archive window -> gone entirely.
    expect(archivedNames).not.toContain("retention_probe_archived");
  });

  it("skips the sweep when automatic clean-up is disabled", async () => {
    await admin!.from("admin_rpc_audit_retention").update({ purge_enabled: false }).eq("id", true);
    const { data } = await admin!.rpc("purge_admin_rpc_audit");
    expect((data as { skipped?: boolean } | null)?.skipped).toBe(true);
    await admin!.from("admin_rpc_audit_retention").update({ purge_enabled: true }).eq("id", true);
  });

  it("deletes without archiving when archiving is off", async () => {
    await admin!
      .from("admin_rpc_audit_retention")
      .update({ archive_enabled: false })
      .eq("id", true);

    await admin!.from("admin_rpc_audit").insert({
      function_name: "retention_probe_noarchive",
      status: "ok",
      request_id: MARKER,
      details: {},
      created_at: daysAgo(200),
    });

    const { data } = await admin!.rpc("purge_admin_rpc_audit");
    expect(Number((data as { deleted?: number } | null)?.deleted ?? 0)).toBeGreaterThan(0);

    const { data: archived } = await admin!
      .from("admin_rpc_audit_archive")
      .select("function_name")
      .eq("function_name", "retention_probe_noarchive");
    expect(archived ?? []).toHaveLength(0);

    await admin!.from("admin_rpc_audit_retention").update({ archive_enabled: true }).eq("id", true);
  });
});
