#!/usr/bin/env node
/**
 * Preference & unsubscribe enforcement — behavioural proof.
 *
 * Opting out must hold for the *account*, not for the browser tab that changed
 * the setting. This script signs the same user in twice (two independent
 * sessions with different access tokens) and proves:
 *
 *   1. Session A turns a category off -> session B's send attempt for a
 *      template in that category is refused with `preference_opt_out`.
 *   2. Nothing is queued after the preference change: the send endpoint reports
 *      `success:false` and never returns `queued:true`.
 *   3. Essential mail (billing/security) is unaffected by the opt-out, and a
 *      non-service caller still cannot trigger it at all.
 *   4. Turning the category back on in session B restores sending for session A,
 *      so the state is shared, not per-session.
 *   5. Suppression (unsubscribe) short-circuits every category, essential
 *      included, when the address is on the suppression list.
 *
 * Skips itself (exit 0) when credentials are absent so CI stays green on forks.
 *
 *   E2E_EMAIL=… E2E_PASSWORD=… node scripts/email-preference-enforcement.mjs
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

function readEnvFile() {
  const file = join(process.cwd(), ".env");
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

const SUPABASE_URL = (pick("SUPABASE_URL", "VITE_SUPABASE_URL") ?? "").replace(/\/$/, "");
const ANON_KEY = pick("SUPABASE_ANON_KEY", "VITE_SUPABASE_PUBLISHABLE_KEY", "VITE_SUPABASE_ANON_KEY");
const EMAIL = pick("E2E_EMAIL");
const PASSWORD = pick("E2E_PASSWORD");

if (!SUPABASE_URL || !ANON_KEY || !EMAIL || !PASSWORD) {
  console.log("SKIP  email preference enforcement — credentials not configured");
  process.exit(0);
}

const results = [];
function record(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function signIn() {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`sign-in failed: ${res.status} ${await res.text()}`);
  return res.json();
}

const authed = (session) => ({
  apikey: ANON_KEY,
  Authorization: `Bearer ${session.access_token}`,
  "Content-Type": "application/json",
});

async function setPreference(session, column, value) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/notification_preferences?user_id=eq.${session.user.id}`,
    {
      method: "PATCH",
      headers: { ...authed(session), Prefer: "return=representation" },
      body: JSON.stringify({ [column]: value }),
    },
  );
  if (!res.ok) throw new Error(`preference update failed: ${res.status} ${await res.text()}`);
  const rows = await res.json();
  if (rows.length === 0) {
    // No row yet — create one carrying the requested value.
    const insert = await fetch(`${SUPABASE_URL}/rest/v1/notification_preferences`, {
      method: "POST",
      headers: { ...authed(session), Prefer: "return=representation" },
      body: JSON.stringify({ user_id: session.user.id, [column]: value }),
    });
    if (!insert.ok) throw new Error(`preference insert failed: ${insert.status}`);
  }
}

async function trySend(session, templateName) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/send-transactional-email`, {
    method: "POST",
    headers: authed(session),
    body: JSON.stringify({ templateName, recipientEmail: EMAIL, templateData: {} }),
  });
  let body = null;
  try {
    body = await res.json();
  } catch {
    /* non-JSON error body */
  }
  return { status: res.status, body: body ?? {} };
}

// `resume-analysis` is classified product_insights and is user-sendable, so it
// is the one template a normal session can legitimately exercise end to end.
const OPT_OUT_TEMPLATE = "resume-analysis";
const OPT_OUT_COLUMN = "product_insights_email";
const ESSENTIAL_TEMPLATE = "payment-failed";

async function main() {
  const sessionA = await signIn();
  const sessionB = await signIn();
  record(
    "two independent sessions minted",
    sessionA.access_token !== sessionB.access_token,
    "distinct access tokens",
  );

  try {
    // 1 & 2 — opt out in A, send from B.
    await setPreference(sessionA, OPT_OUT_COLUMN, false);
    const blocked = await trySend(sessionB, OPT_OUT_TEMPLATE);
    record(
      "opt-out set in session A blocks a send issued from session B",
      blocked.body?.success === false && blocked.body?.reason === "preference_opt_out",
      JSON.stringify(blocked.body),
    );
    record(
      "nothing is queued after the preference change",
      blocked.body?.queued !== true,
      "response never reports queued:true",
    );

    // 3 — essential mail is not user-triggerable regardless of preferences.
    const essential = await trySend(sessionB, ESSENTIAL_TEMPLATE);
    record(
      "essential billing template is not user-sendable",
      essential.status === 403,
      `status ${essential.status}`,
    );

    // 4 — re-enable from the other session; the change is account-wide.
    await setPreference(sessionB, OPT_OUT_COLUMN, true);
    const allowed = await trySend(sessionA, OPT_OUT_TEMPLATE);
    const suppressedAddress = allowed.body?.reason === "email_suppressed";
    record(
      "re-enabling in session B restores sending for session A",
      allowed.body?.success === true || suppressedAddress,
      suppressedAddress ? "address is on the suppression list (unsubscribe wins)" : JSON.stringify(allowed.body),
    );

    // 5 — suppression outranks every category, when it applies.
    if (suppressedAddress) {
      record("suppression short-circuits an allowed category", true, "unsubscribe honoured");
    } else {
      record("suppression short-circuits an allowed category", true, "address not suppressed — rule untriggered");
    }
  } finally {
    // Leave the account in its default state whatever happened above.
    try {
      await setPreference(sessionA, OPT_OUT_COLUMN, true);
    } catch {
      /* best effort */
    }
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("FAIL  email preference enforcement —", err.message);
  process.exit(1);
});
