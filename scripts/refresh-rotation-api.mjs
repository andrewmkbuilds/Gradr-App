#!/usr/bin/env node
/**
 * Playwright API test: refresh-token rotation and post-sign-out revocation.
 *
 * Uses Playwright's APIRequestContext (no browser) to talk to the auth API and
 * prove the properties a stolen-token attack depends on:
 *
 *   1. sign in mints session A (access + refresh token R1)
 *   2. refreshing with R1 mints session B with a DIFFERENT refresh token R2
 *      (rotation — a refresh token is single use)
 *   3. replaying the already-spent R1 fails (no session revival from a leaked
 *      copy of an old token)
 *   4. after sign-out, the current refresh token R2 cannot mint a session, and
 *      the access token no longer resolves a user
 *   5. every previously minted refresh token (R1, R2) stays dead afterwards
 *
 * Skips itself (exit 0) when credentials are not configured, so CI stays green
 * on forks and secret-less runs.
 *
 *   E2E_EMAIL=… E2E_PASSWORD=… node scripts/refresh-rotation-api.mjs
 */
import { request } from "playwright";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { writeHtmlReport } from "./lib/htmlReport.mjs";

const ROOT = process.cwd();
const HTML_REPORT = join(ROOT, "tests/reports/html/refresh-rotation.html");

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
const EMAIL = pick("E2E_EMAIL");
const PASSWORD = pick("E2E_PASSWORD");

if (!SUPABASE_URL || !ANON_KEY) {
  console.log("SKIP  refresh rotation API test — backend URL/key not configured.");
  process.exit(0);
}
if (!EMAIL || !PASSWORD) {
  console.log("SKIP  refresh rotation API test — E2E_EMAIL / E2E_PASSWORD not set.");
  process.exit(0);
}

const results = [];
function record(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function run() {
  const api = await request.newContext({
    baseURL: `${SUPABASE_URL}/auth/v1`,
    extraHTTPHeaders: { apikey: ANON_KEY, "content-type": "application/json" },
  });

  const signIn = () =>
    api.post("/token?grant_type=password", { data: { email: EMAIL, password: PASSWORD } });
  const refresh = (token) =>
    api.post("/token?grant_type=refresh_token", { data: { refresh_token: token } });
  const getUser = (accessToken) =>
    api.get("/user", { headers: { Authorization: `Bearer ${accessToken}` } });

  /* ------------------------------ 1. sign in ------------------------------ */
  const first = await signIn();
  if (!first.ok()) {
    record("sign in", false, `HTTP ${first.status()}`);
    return finish(api);
  }
  const sessionA = await first.json();
  record("sign in mints a session", Boolean(sessionA.access_token && sessionA.refresh_token));

  const R1 = sessionA.refresh_token;

  /* ------------------------- 2. rotation on refresh ----------------------- */
  const refreshed = await refresh(R1);
  const sessionB = refreshed.ok() ? await refreshed.json() : null;
  record("refresh returns a new session", Boolean(sessionB?.access_token), `HTTP ${refreshed.status()}`);

  const R2 = sessionB?.refresh_token;
  record(
    "refresh token is rotated (R2 !== R1)",
    Boolean(R2) && R2 !== R1,
    R2 ? `${String(R1).slice(0, 6)}… → ${String(R2).slice(0, 6)}…` : "no refresh token returned",
  );
  record(
    "refresh returns a fresh access token",
    Boolean(sessionB?.access_token) && sessionB.access_token !== sessionA.access_token,
  );

  /* ------------------- 3. the spent refresh token is dead ----------------- */
  // Supabase allows a short reuse window for in-flight retries; the replay must
  // either fail outright or return the *same* rotated token, never a new chain.
  const replay = await refresh(R1);
  const replayBody = replay.ok() ? await replay.json() : null;
  const replaySpawnedNewChain = Boolean(replayBody?.refresh_token) && replayBody.refresh_token !== R2;
  record(
    "spent refresh token cannot start a new session chain",
    !replaySpawnedNewChain,
    replay.ok() ? "replay returned the rotated session (reuse window)" : `rejected with HTTP ${replay.status()}`,
  );

  /* ------------------------------ 4. sign out ----------------------------- */
  const signOut = await api.post("/logout", {
    headers: { Authorization: `Bearer ${sessionB?.access_token ?? sessionA.access_token}` },
  });
  record("sign out accepted", signOut.status() < 400, `HTTP ${signOut.status()}`);

  const userAfter = await getUser(sessionB?.access_token ?? sessionA.access_token);
  record("access token no longer resolves a user", userAfter.status() === 401, `HTTP ${userAfter.status()}`);

  /* ------------- 5. no previously minted refresh token survives ----------- */
  for (const [label, token] of [["R1 (original)", R1], ["R2 (rotated)", R2]]) {
    if (!token) continue;
    const attempt = await refresh(token);
    const body = attempt.ok() ? await attempt.json() : null;
    record(
      `${label} cannot mint a session after sign out`,
      !attempt.ok() || !body?.access_token,
      `HTTP ${attempt.status()}`,
    );
  }

  // A fresh sign-in must still work — revocation targeted the session, not the user.
  const again = await signIn();
  record("credentials still work after revocation", again.ok(), `HTTP ${again.status()}`);
  if (again.ok()) {
    const s = await again.json();
    await api.post("/logout", { headers: { Authorization: `Bearer ${s.access_token}` } });
  }

  return finish(api);
}

async function finish(api) {
  await api.dispose();
  writeHtmlReport({
    outFile: HTML_REPORT,
    title: "Gradr refresh-token rotation (API)",
    baseUrl: SUPABASE_URL,
    results,
  });
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} refresh-rotation checks passed.`);
  console.log(`HTML report: ${HTML_REPORT}`);
  if (failed.length) process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
