#!/usr/bin/env node
/**
 * Admin RPC grant guard.
 *
 * Every `admin_*` database routine is SECURITY DEFINER and checks the caller's
 * admin role inside the function body. That design only holds up when the
 * EXECUTE grant matches: `authenticated` must be able to *call* the routine
 * (otherwise admins get "permission denied for function …" before the internal
 * check ever runs) while `anon` must not.
 *
 * Grants drift — a later CREATE OR REPLACE of a function resets its ACL — so
 * this test calls every admin routine over the real REST API and asserts:
 *
 *   1. as an admin       → 2xx, or a domain error from the function body
 *                          (never 42501 "permission denied for function")
 *   2. as a normal user  → refused: either 42501 or the function's own
 *                          "admin required" exception. Never a 2xx payload.
 *   3. signed out (anon) → refused (401/403).
 *
 * Note on how this is verified: the routines cannot be exercised from psql,
 * because that connection runs as a restricted role that is not a member of
 * `authenticated` (`SET ROLE authenticated` → "permission denied to set role").
 * Role behaviour must therefore be checked through the API with a real JWT,
 * which is exactly what this script does.
 *
 * Credentials (any of these forms; the script skips with exit 0 when absent):
 *
 *   ADMIN_E2E_EMAIL / ADMIN_E2E_PASSWORD   admin account
 *   USER_E2E_EMAIL  / USER_E2E_PASSWORD    non-admin account (optional)
 *   ADMIN_ACCESS_TOKEN / USER_ACCESS_TOKEN pre-minted JWTs (skip password grant)
 *
 *   node scripts/admin-rpc-guard.mjs
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { writeHtmlReport } from "./lib/htmlReport.mjs";

const ROOT = process.cwd();
const HTML_REPORT = join(ROOT, "tests/reports/html/admin-rpc-guard.html");

function readEnvFile() {
  const file = join(ROOT, ".env");
  if (!existsSync(file)) return {};
  return Object.fromEntries(
    readFileSync(file, "utf8")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#") && l.includes("="))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
      }),
  );
}

const fileEnv = readEnvFile();
const pick = (...keys) => keys.map((k) => process.env[k] ?? fileEnv[k]).find(Boolean);

const SUPABASE_URL = pick("SUPABASE_URL", "VITE_SUPABASE_URL")?.replace(/\/$/, "");
const ANON_KEY = pick("SUPABASE_ANON_KEY", "VITE_SUPABASE_PUBLISHABLE_KEY", "VITE_SUPABASE_ANON_KEY");

const ADMIN_TOKEN = pick("ADMIN_ACCESS_TOKEN");
const USER_TOKEN = pick("USER_ACCESS_TOKEN");
const ADMIN_EMAIL = pick("ADMIN_E2E_EMAIL");
const ADMIN_PASSWORD = pick("ADMIN_E2E_PASSWORD");
const USER_EMAIL = pick("USER_E2E_EMAIL", "E2E_EMAIL");
const USER_PASSWORD = pick("USER_E2E_PASSWORD", "E2E_PASSWORD");

if (!SUPABASE_URL || !ANON_KEY) {
  console.log("SKIP  admin RPC guard — backend URL/key not configured.");
  process.exit(0);
}
if (!ADMIN_TOKEN && !(ADMIN_EMAIL && ADMIN_PASSWORD)) {
  console.log("SKIP  admin RPC guard — ADMIN_ACCESS_TOKEN or ADMIN_E2E_EMAIL/PASSWORD not set.");
  process.exit(0);
}

const NIL = "00000000-0000-0000-0000-000000000000";

/**
 * Read-only admin routines: an admin must get a 2xx payload back.
 * Write routines are called with a deliberately non-existent target so the
 * admin gate is exercised without mutating anything — the function reaches its
 * own "not found" error, which proves the caller cleared the role check.
 */
const READ_RPCS = [
  { name: "is_admin", body: {} },
  { name: "admin_audit_actors", body: {} },
  { name: "admin_legal_document_stats", body: {} },
  { name: "admin_legal_pending_users", body: { _document_id: NIL, _limit: 5 } },
  { name: "admin_email_weekly_report", body: {} },
  { name: "admin_email_retention_settings", body: {} },
  { name: "admin_affiliate_overview", body: {} },
  { name: "admin_verification_requests", body: { _status: null, _limit: 5 } },
  { name: "admin_verification_timeline", body: { _request_id: NIL } },
];

const WRITE_RPCS = [
  { name: "admin_review_verification_request", body: { _request_id: NIL, _decision: "approved", _notes: null, _discount_percentage: null } },
  { name: "admin_review_verification", body: { _verification_id: NIL, _status: "approved", _reason: null } },
  { name: "admin_publish_legal_document", body: { _document_id: NIL } },
  { name: "admin_resolve_email_alert", body: { _alert_id: NIL } },
  { name: "admin_mark_payout_paid", body: { _payout_id: NIL, _reference: "guard", _payout_method: "manual" } },
  { name: "admin_set_commission_status", body: { _commission_ids: [NIL], _status: "approved", _reason: "guard" } },
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

async function callRpc(fn, body, token) {
  const headers = { apikey: ANON_KEY, "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* non-JSON body */
  }
  return { status: res.status, code: json?.code ?? null, message: json?.message ?? text.slice(0, 120) };
}

/** 42501 means the EXECUTE grant is missing — the drift this guard exists to catch. */
const isGrantDenied = (r) => r.code === "42501";
/** The function's own role check fired: it was reachable but refused the caller. */
const isRoleRefused = (r) =>
  r.status >= 400 && /admin/i.test(r.message ?? "") && !isGrantDenied(r);

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

  const adminCheck = await callRpc("is_admin", {}, adminToken);
  if (adminCheck.status !== 200 || adminCheck.message?.trim?.() !== "true") {
    record("admin account has the admin role", false, `is_admin returned ${adminCheck.status} ${adminCheck.message}`);
    return;
  }
  record("admin account has the admin role", true);

  for (const { name, body } of READ_RPCS) {
    const r = await callRpc(name, body, adminToken);
    record(`admin can read ${name}`, r.status >= 200 && r.status < 300, `${r.status} ${r.code ?? ""} ${r.status < 300 ? "" : r.message}`.trim());
  }

  for (const { name, body } of WRITE_RPCS) {
    const r = await callRpc(name, body, adminToken);
    // Reachable for an admin: anything except a missing-grant refusal.
    record(`admin can invoke ${name}`, !isGrantDenied(r), `${r.status} ${r.code ?? ""} ${r.message}`.trim());
  }

  for (const { name, body } of [...READ_RPCS, ...WRITE_RPCS]) {
    if (name === "is_admin") continue;
    const r = await callRpc(name, body, null);
    record(`signed-out callers are refused by ${name}`, r.status === 401 || r.status === 403, `${r.status} ${r.code ?? ""}`);
  }

  if (userToken) {
    for (const { name, body } of [...READ_RPCS, ...WRITE_RPCS]) {
      if (name === "is_admin") continue;
      const r = await callRpc(name, body, userToken);
      const refused = r.status >= 400 && (isGrantDenied(r) || isRoleRefused(r) || r.status === 401 || r.status === 403);
      record(`non-admin callers are refused by ${name}`, refused, `${r.status} ${r.code ?? ""} ${r.message}`.trim());
    }
  } else {
    console.log("note: non-admin leg skipped — set USER_E2E_EMAIL / USER_E2E_PASSWORD (or USER_ACCESS_TOKEN).");
  }
}

run()
  .catch((err) => {
    record("admin RPC guard run", false, err.message);
  })
  .finally(() => {
    const failed = results.filter((r) => !r.ok);
    writeHtmlReport({
      outFile: HTML_REPORT,
      title: "Admin RPC grant guard",
      baseUrl: SUPABASE_URL,
      results,
    });
    console.log(`\n${results.length - failed.length}/${results.length} checks passed · report: ${HTML_REPORT}`);
    process.exit(failed.length ? 1 : 0);
  });
