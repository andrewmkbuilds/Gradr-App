import { describe, it, expect } from "vitest";
import { query, dbConfigured } from "../../scripts/securityBaseline.mjs";

/**
 * RLS access tests for `public.user_preferences`.
 *
 * Guards security finding `SUPA_auth_allow_anonymous_sign_ins`: anonymous
 * (guest) sessions must not reach preference rows, while a real signed-in
 * account must reach its own row and only its own row.
 *
 * Every case runs inside a transaction that is rolled back, so nothing is
 * persisted. Skipped when no database connection is configured.
 */
const OWNER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

/** Impersonating `authenticated` needs role membership; local sandbox roles lack it. */
function canImpersonate(): boolean {
  if (!dbConfigured()) return false;
  try {
    query("begin; set local role authenticated; rollback;");
    return true;
  } catch {
    return false;
  }
}

const maybe = canImpersonate() ? describe : describe.skip;

/** Run SQL as `authenticated` with a synthetic JWT and return the last result rows. */
function asUser(uid: string, isAnonymous: boolean, sql: string): string[][] {
  const claims = JSON.stringify({ sub: uid, role: "authenticated", is_anonymous: isAnonymous });
  return query(`
    begin;
    insert into public.user_preferences (user_id, target_role) values ('${OWNER}', 'guard-test');
    set local role authenticated;
    set local request.jwt.claims = '${claims}';
    ${sql}
    rollback;
  `);
}

const rowCount = (rows: string[][]) => Number(rows[rows.length - 1]?.[0] ?? "-1");

maybe("user_preferences RLS", () => {
  it("hides rows from an anonymous (guest) session", () => {
    const rows = asUser(OWNER, true, `select count(*) from public.user_preferences;`);
    expect(rowCount(rows)).toBe(0);
  });

  it("blocks writes from an anonymous (guest) session", () => {
    expect(() =>
      asUser(
        OWNER,
        true,
        `insert into public.user_preferences (user_id, target_role) values ('${OWNER}', 'guest');`,
      ),
    ).toThrow(/row-level security/i);
  });

  it("lets a real account read its own row", () => {
    const rows = asUser(OWNER, false, `select count(*) from public.user_preferences;`);
    expect(rowCount(rows)).toBe(1);
  });

  it("hides another account's row from a real account", () => {
    const rows = asUser(OTHER, false, `select count(*) from public.user_preferences;`);
    expect(rowCount(rows)).toBe(0);
  });

  it("lets a real account write its own row", () => {
    const rows = asUser(
      OTHER,
      false,
      `insert into public.user_preferences (user_id, target_role) values ('${OTHER}', 'ok');
       select count(*) from public.user_preferences;`,
    );
    expect(rowCount(rows)).toBe(1);
  });

  it("audits writes with the user id and anonymous flag", () => {
    const rows = asUser(
      OTHER,
      false,
      `insert into public.user_preferences (user_id, target_role) values ('${OTHER}', 'audited');
       set local role postgres;
       select count(*) from public.security_audit_log
        where category = 'data_access'
          and event = 'user_preferences_insert'
          and user_id = '${OTHER}'
          and (details ->> 'is_anonymous') = 'false';`,
    );
    expect(rowCount(rows)).toBe(1);
  });
});
