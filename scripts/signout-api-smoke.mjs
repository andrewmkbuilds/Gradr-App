#!/usr/bin/env node
/**
 * API-level sign-out smoke test — no browser required.
 *
 * Signs in against the auth API, confirms the session works, signs out, and
 * then proves the session is genuinely dead server-side:
 *   1. the access token no longer resolves a user (401),
 *   2. the refresh token can no longer mint a new session,
 * which is what "cleared after refresh" actually means — a page reload rehydrates
 * from the stored refresh token, so a token that still refreshes is a live session
 * regardless of what the browser cleared locally.
 *
 * Skips itself (exit 0) when no credentials are configured, so CI stays green on
 * forks and secret-less runs.
 *
 *   E2E_EMAIL=… E2E_PASSWORD=… node scripts/signout-api-smoke.mjs
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

function readEnvFile() {
  const file = join(process.cwd(), ".env");
  if (!existsSync(file)) return {};
  return Object.fromEntries(
    readFileSync(file, "utf8")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const i = line.indexOf("=");
        return [line.slice(0, i).trim(), line.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
      }),
  );
}

const fileEnv = readEnvFile();
const pick = (...keys) => keys.map((k) => process.env[k] ?? fileEnv[k]).find(Boolean);

const SUPABASE_URL = pick("SUPABASE_URL", "VITE_SUPABASE_URL");
const ANON_KEY = pick("SUPABASE_ANON_KEY", "VITE_SUPABASE_PUBLISHABLE_KEY", "VITE_SUPABASE_ANON_KEY");
const EMAIL = pick("E2E_EMAIL");
const PASSWORD = pick("E2E_PASSWORD");

const results = [];
function record(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

if (!SUPABASE_URL || !ANON_KEY) {
  console.log("SKIP  sign-out API smoke — backend URL/key not configured.");
  process.exit(0);
}
if (!EMAIL || !PASSWORD) {
  console.log("SKIP  sign-out API smoke — E2E_EMAIL / E2E_PASSWORD not set.");
  process.exit(0);
}

const auth = (path, init = {}) =>
  fetch(`${SUPABASE_URL.replace(/\/$/, "")}/auth/v1${path}`, {
    ...init,
    headers: { apikey: ANON_KEY, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });

async function run() {
  // 1. Sign in.
  const signIn = await auth("/token?grant_type=password", {
    method: "POST",
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const session = await signIn.json().catch(() => ({}));
  record("sign-in returns a session", signIn.ok && !!session.access_token, `status ${signIn.status}`);
  if (!session.access_token) {
    console.log("\nCannot continue without a session.");
    process.exit(1);
  }

  const bearer = { Authorization: `Bearer ${session.access_token}` };

  // 2. The session is live before sign-out (control).
  const before = await auth("/user", { headers: bearer });
  record("session resolves a user before sign-out", before.ok, `status ${before.status}`);

  // 3. Sign out — global scope, matching supabase.auth.signOut() in the app.
  const signOut = await auth("/logout?scope=global", { method: "POST", headers: bearer });
  record("sign-out accepted", signOut.status === 204 || signOut.ok, `status ${signOut.status}`);

  // 4. Access token is dead.
  const after = await auth("/user", { headers: bearer });
  record("access token is rejected after sign-out", after.status === 401 || after.status === 403, `status ${after.status}`);

  // 5. Refresh token cannot resurrect the session — this is the "after refresh" case.
  const refresh = await auth("/token?grant_type=refresh_token", {
    method: "POST",
    body: JSON.stringify({ refresh_token: session.refresh_token }),
  });
  const refreshed = await refresh.json().catch(() => ({}));
  record(
    "refresh token cannot mint a new session after sign-out",
    !refresh.ok && !refreshed.access_token,
    `status ${refresh.status}`,
  );

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} sign-out API checks passed.`);
  if (failed.length) process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
