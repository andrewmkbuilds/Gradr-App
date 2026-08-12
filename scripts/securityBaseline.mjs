/**
 * Security baseline checks for the Gradr database.
 *
 * Pure catalog queries (pg_policies, pg_class, pg_proc, pg_trigger) compared
 * against `supabase/security/baseline.json`. Used by:
 *   - `scripts/security-baseline.mjs`  (CI gate)
 *   - `src/test/securityBaseline.test.ts` (regression tests)
 *
 * Requires read-only Postgres access via psql (PG* env vars or DATABASE_URL).
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
export const BASELINE_PATH = path.join(here, "..", "supabase", "security", "baseline.json");

export function loadBaseline() {
  return JSON.parse(readFileSync(BASELINE_PATH, "utf8"));
}

export function dbConfigured() {
  return Boolean(process.env.DATABASE_URL || process.env.PGHOST);
}

/** Run a query and return rows as arrays of column strings. */
export function query(sql) {
  const args = ["-X", "-A", "-t", "-F", "\u0001", "-v", "ON_ERROR_STOP=1", "-c", sql];
  if (process.env.DATABASE_URL) args.unshift(process.env.DATABASE_URL);
  const out = execFileSync("psql", args, { encoding: "utf8" });
  return out
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => l.split("\u0001"));
}

const q = {
  rls: `select c.relname, c.relrowsecurity from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r'`,
  policies: `select tablename, policyname, cmd, array_to_string(roles, ',')
             from pg_policies where schemaname = 'public'`,
  // Read grants straight from pg_class.relacl: information_schema only shows
  // grants visible to the connecting role, which hides them from a read-only CI role.
  grants: `select c.relname, coalesce(array_to_string(c.relacl, ','), '') from pg_class c
           join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'r'`,
  funcs: `select p.proname, coalesce(array_to_string(p.proacl, ','), '') , p.prosecdef
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public'`,
  triggers: `select c.relname, t.tgname from pg_trigger t
             join pg_class c on c.oid = t.tgrelid
             join pg_namespace n on n.oid = c.relnamespace
             where n.nspname = 'public' and not t.tgisinternal`,
};

function aclGrantees(acl) {
  // acl entries look like `authenticated=X/postgres` or `=X/postgres` (PUBLIC)
  return acl
    .split(",")
    .filter(Boolean)
    .filter((e) => e.split("=")[1]?.split("/")[0]?.includes("X"))
    .map((e) => e.split("=")[0] || "PUBLIC");
}

const PRIV_LETTERS = { r: "SELECT", a: "INSERT", w: "UPDATE", d: "DELETE" };

/** Parse a relacl string into `{ role: ["SELECT", ...] }` for anon/authenticated/PUBLIC. */
function tablePrivileges(acl) {
  const out = {};
  for (const entry of acl.split(",").filter(Boolean)) {
    const [rawRole, rest] = entry.split("=");
    const role = rawRole || "PUBLIC";
    if (!["anon", "authenticated", "PUBLIC"].includes(role)) continue;
    const letters = (rest ?? "").split("/")[0];
    out[role] = [...new Set([...letters].map((l) => PRIV_LETTERS[l]).filter(Boolean))];
  }
  return out;
}

/**
 * @returns {{name: string, ok: boolean, detail: string}[]}
 */
export function runBaselineChecks(baseline = loadBaseline()) {
  const results = [];
  const add = (name, ok, detail = "") => results.push({ name, ok, detail });

  const rls = new Map(q_rows(q.rls).map(([t, on]) => [t, on === "t"]));
  const policies = q_rows(q.policies).map(([table, name, cmd, roles]) => ({
    table,
    name,
    cmd,
    roles: (roles || "").split(",").filter(Boolean),
  }));
  const grants = new Map(q_rows(q.grants).map(([t, acl]) => [t, tablePrivileges(acl || "")]));
  const funcs = q_rows(q.funcs).map(([name, acl, secdef]) => ({
    name,
    grantees: aclGrantees(acl || ""),
    securityDefiner: secdef === "t",
  }));
  const triggers = q_rows(q.triggers);

  // 1. RLS enabled on every table that must have it.
  for (const table of baseline.rlsRequired) {
    add(
      `rls enabled: ${table}`,
      rls.get(table) === true,
      rls.has(table) ? "RLS is disabled" : "table missing",
    );
  }

  // 2. No table in the protected list may expose a policy to anon/public.
  for (const table of baseline.noAnonPolicyTables) {
    const leaky = policies.filter(
      (p) => p.table === table && p.roles.some((r) => r === "anon" || r === "public"),
    );
    add(`no anon/public policy: ${table}`, leaky.length === 0, leaky.map((p) => p.name).join(", "));
  }

  // 3. Log/mirror tables must not be client-writable.
  for (const table of baseline.appendOnlyTables) {
    const writable = policies.filter(
      (p) => p.table === table && ["INSERT", "UPDATE", "DELETE", "ALL"].includes(p.cmd),
    );
    add(
      `append-only (no client writes): ${table}`,
      writable.length === 0,
      writable.map((p) => `${p.name} [${p.cmd}]`).join(", "),
    );
  }

  // 4. Required policies still exist with the expected role scope.
  for (const req of baseline.requiredPolicies) {
    const match = policies.filter(
      (p) =>
        p.table === req.table &&
        (p.cmd === req.cmd || p.cmd === "ALL") &&
        req.roles.every((r) => p.roles.includes(r)),
    );
    add(
      `policy present: ${req.table} ${req.cmd} for ${req.roles.join("/")}`,
      match.length > 0,
      "no matching policy",
    );
  }

  // 5. Exact table grants for sensitive log tables.
  for (const [table, expected] of Object.entries(baseline.tableGrants)) {
    for (const [role, privs] of Object.entries(expected)) {
      const actual = [...(grants.get(table)?.[role] ?? [])].sort();
      const want = [...privs].sort();
      add(
        `grants: ${table} -> ${role}`,
        JSON.stringify(actual) === JSON.stringify(want),
        `expected [${want}], found [${actual}]`,
      );
    }
  }

  // 6. Audit triggers still attached.
  for (const t of baseline.auditTriggers) {
    add(
      `audit trigger: ${t.table}.${t.trigger}`,
      triggers.some(([table, name]) => table === t.table && name === t.trigger),
      "trigger missing",
    );
  }

  // 7. SECURITY DEFINER execute privileges.
  const { anonAllowlist, authenticatedAllowlist } = baseline.functionExecute;
  for (const fn of funcs.filter((f) => f.securityDefiner)) {
    add(
      `no PUBLIC execute: ${fn.name}`,
      !fn.grantees.includes("PUBLIC"),
      "PUBLIC can execute this SECURITY DEFINER function",
    );
    if (fn.grantees.includes("anon")) {
      add(
        `anon execute allowlisted: ${fn.name}`,
        anonAllowlist.includes(fn.name),
        "anon can execute but is not in the baseline allowlist",
      );
    }
    if (fn.grantees.includes("authenticated")) {
      add(
        `authenticated execute allowlisted: ${fn.name}`,
        authenticatedAllowlist.includes(fn.name),
        "authenticated can execute but is not in the baseline allowlist",
      );
    }
  }

  // 8. Allowlisted functions that no longer exist are stale baseline entries.
  const secdefNames = new Set(funcs.filter((f) => f.securityDefiner).map((f) => f.name));
  for (const name of new Set([...anonAllowlist, ...authenticatedAllowlist])) {
    add(`allowlist entry still exists: ${name}`, secdefNames.has(name), "stale baseline entry");
  }

  return results;
}

// Small cache so the checks only hit the database once per process.
const cache = new Map();
function q_rows(sql) {
  if (!cache.has(sql)) cache.set(sql, query(sql));
  return cache.get(sql);
}
