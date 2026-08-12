import { describe, it, expect } from "vitest";
import { runBaselineChecks, loadBaseline, dbConfigured } from "../../scripts/securityBaseline.mjs";

/**
 * RLS / policy / SECURITY DEFINER regression tests.
 *
 * Skipped automatically when no database connection is configured (e.g. local
 * frontend-only runs). CI provides DATABASE_URL.
 */
const maybe = dbConfigured() ? describe : describe.skip;

maybe("database security baseline", () => {
  const baseline = loadBaseline();
  const results = runBaselineChecks(baseline);

  it("runs every configured check", () => {
    expect(results.length).toBeGreaterThan(0);
  });

  for (const r of results) {
    it(r.name, () => {
      expect(r.ok, r.detail).toBe(true);
    });
  }
});

describe("security baseline file", () => {
  const baseline = loadBaseline();

  it("protects every critical table with RLS", () => {
    for (const t of ["resumes", "subscribers", "user_roles", "security_audit_log"]) {
      expect(baseline.rlsRequired).toContain(t);
    }
  });

  it("keeps log tables append-only from the client", () => {
    for (const t of ["digest_send_logs", "email_notification_log", "admin_audit_log"]) {
      expect(baseline.appendOnlyTables).toContain(t);
    }
  });

  it("keeps the anon function allowlist minimal", () => {
    expect(baseline.functionExecute.anonAllowlist.length).toBeLessThanOrEqual(3);
  });
});
