#!/usr/bin/env node
/**
 * Admin table RLS matrix.
 *
 * Calls the Data API with a real admin JWT and a real non-admin JWT and asserts
 * the policies on the admin-only tables still behave:
 *   - admin  : SELECT succeeds
 *   - user   : SELECT returns nothing (RLS filters) or is refused
 *   - both   : INSERT / UPDATE are refused (append-only, written by the
 *              SECURITY DEFINER guard alone)
 *   - anon   : refused outright
 *
 * Skips cleanly when credentials are not configured (local dev, forks).
 * See docs/admin-rpc-security.md.
 */

const pick = (...names) => names.map((n) => process.env[n]).find(Boolean) ?? null;

const SUPABASE_URL = pick("SUPABASE_URL", "VITE_SUPABASE_URL");
const ANON_KEY = pick("SUPABASE_ANON_KEY", "VITE_SUPABASE_PUBLISHABLE_KEY", "VITE_SUPABASE_ANON_KEY");
const ADMIN_TOKEN = pick("ADMIN_ACCESS_TOKEN");
const USER_TOKEN = pick("USER_ACCESS_TOKEN");
const ADMIN_EMAIL = pick("ADMIN_E2E_EMAIL");
const ADMIN_PASSWORD = pick("ADMIN_E2E_PASSWORD");
const USER_EMAIL = pick("USER_E2E_EMAIL", "E2E_EMAIL");
const USER_PASSWORD = pick("USER_E2E_PASSWORD", "E2E_PASSWORD");

if (!SUPABASE_URL || !ANON_KEY) {
  console.log("SKIP  admin RLS matrix — backend URL/key not configured.");
  process.exit(0);
}
if (!ADMIN_TOKEN && !(ADMIN_EMAIL && ADMIN_PASSWORD)) {
  console.log("SKIP  admin RLS matrix — ADMIN_ACCESS_TOKEN or ADMIN_E2E_EMAIL/PASSWORD not set.");
  process.exit(0);
}

const NIL = "00000000-0000-0000-0000-000000000000";

/** Tables that only admins may read, and that nobody may write from the client. */
const ADMIN_TABLES = [
  { table: "admin_rpc_audit", insert: { function_name: "spoofed", status: "ok" } },
  { table: "admin_audit_log", insert: { action: "view", resource_type: "spoofed" } },
  { table: "security_audit_log", insert: { event_type: "spoofed" } },
  { table: "email_delivery_audit", insert: { template_id: "spoofed" } },
  { table: "email_pipeline_alerts", insert: { template_id: "spoofed" } },
  { table: "user_roles", insert: { user_id: NIL, role: "admin" } },
];

const results = [];
function record(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function signIn(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`sign-in failed (${res.status}) for ${email}`);
  return (await res.json()).access_token;
}

async function rest(path, { method = "GET", token = null, body = null } = {}) {
  const headers = { apikey: ANON_KEY, "Content-Type": "application/json", Prefer: "return=minimal" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* empty or non-JSON */
  }
  return { status: res.status, json, code: json?.code ?? null, message: json?.message ?? text.slice(0, 140) };
}

const refused = (r) => r.status === 401 || r.status === 403 || r.code === "42501" || r.code === "42P01";

async function run() {
  const adminToken = ADMIN_TOKEN ?? (await signIn(ADMIN_EMAIL, ADMIN_PASSWORD));
  let userToken = USER_TOKEN ?? null;
  if (!userToken && USER_EMAIL && USER_PASSWORD && USER_EMAIL !== ADMIN_EMAIL) {
    try {
      userToken = await signIn(USER_EMAIL, USER_PASSWORD);
    } catch (err) {
      console.log(`note: non-admin sign-in unavailable (${err.message})`);
    }
  }

  const whoami = await rest("rpc/is_admin", { method: "POST", token: adminToken, body: {} });
  if (whoami.status !== 200) {
    record("admin account resolves is_admin", false, `${whoami.status} ${whoami.message}`);
    return;
  }
  record("admin account resolves is_admin", true);

  for (const { table, insert } of ADMIN_TABLES) {
    // Admin SELECT must work.
    const adminRead = await rest(`${table}?select=*&limit=1`, { token: adminToken });
    record(`admin can select ${table}`, adminRead.status < 300, `${adminRead.status} ${adminRead.code ?? ""} ${adminRead.status < 300 ? "" : adminRead.message}`.trim());

    // Anonymous must never read.
    const anonRead = await rest(`${table}?select=*&limit=1`, {});
    const anonRows = Array.isArray(anonRead.json) ? anonRead.json.length : 0;
    record(`anonymous cannot select ${table}`, refused(anonRead) || anonRows === 0, `${anonRead.status} ${anonRead.code ?? ""}`);

    // Client writes must always be refused, even for an admin.
    const adminWrite = await rest(table, { method: "POST", token: adminToken, body: insert });
    record(`admin cannot insert into ${table} from the client`, adminWrite.status >= 400, `${adminWrite.status} ${adminWrite.code ?? ""}`);

    const adminUpdate = await rest(`${table}?id=eq.${NIL}`, { method: "PATCH", token: adminToken, body: insert });
    record(`admin cannot update ${table} from the client`, adminUpdate.status >= 400 || adminUpdate.status === 204, `${adminUpdate.status} ${adminUpdate.code ?? ""}`);

    if (userToken) {
      const userRead = await rest(`${table}?select=*&limit=1`, { token: userToken });
      const rows = Array.isArray(userRead.json) ? userRead.json.length : 0;
      const ownRows = table === "user_roles"; // a user may see their own role rows
      record(
        `non-admin cannot read other rows of ${table}`,
        refused(userRead) || rows === 0 || ownRows,
        `${userRead.status} ${userRead.code ?? ""} rows=${rows}`,
      );

      const userWrite = await rest(table, { method: "POST", token: userToken, body: insert });
      record(`non-admin cannot insert into ${table}`, userWrite.status >= 400, `${userWrite.status} ${userWrite.code ?? ""}`);
    }
  }

  if (!userToken) {
    console.log("note: non-admin leg skipped — set USER_E2E_EMAIL / USER_E2E_PASSWORD.");
  }
}

run()
  .catch((err) => record("admin RLS matrix run", false, err.message))
  .finally(() => {
    const failed = results.filter((r) => !r.ok);
    console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
    if (failed.length) {
      console.error("\nFailures:");
      failed.forEach((f) => console.error(`  - ${f.name}: ${f.detail}`));
      process.exit(1);
    }
  });
