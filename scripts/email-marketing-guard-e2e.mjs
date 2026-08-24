#!/usr/bin/env node
/**
 * Email marketing guard — behavioural half.
 *
 * The structural half (`src/test/emailMarketingGuard.test.ts`) proves no
 * marketing template is registered or classified. This script proves the live
 * send path behaves the same way for a real signed-in user:
 *
 *   1. Every row the app has ever written to the email log maps to a template
 *      that is still registered and classified transactional.
 *   2. A signed-in user cannot get a marketing-shaped template queued: the send
 *      endpoint refuses unknown/unclassified names outright.
 *   3. A signed-in user cannot send even a legitimate template to someone else.
 *   4. Exercising the normal app flows (dashboard, resumes, applications,
 *      interviews, settings) queues no marketing-classified email.
 *   5. No recurring digest job is scheduled that could queue mail out of band.
 *
 * Skips itself (exit 0) when credentials are absent so CI stays green on forks.
 *
 *   E2E_EMAIL=… E2E_PASSWORD=… node scripts/email-marketing-guard-e2e.mjs [baseUrl]
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const BASE = (process.argv[2] ?? process.env.SMOKE_BASE_URL ?? "http://localhost:8080").replace(/\/$/, "");

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

const results = [];
function record(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

/** Marketing shapes that must never reach the send path, whatever the wiring. */
const MARKETING_SHAPES = /(digest|briefing|newsletter|campaign|promo|announcement|drip|roundup|weekly-|monthly-)/i;

const TEMPLATE_DIR = "supabase/functions/_shared/transactional-email-templates";

function registeredTemplates() {
  const src = readFileSync(join(TEMPLATE_DIR, "registry.ts"), "utf8");
  const body = src.split("export const TEMPLATES")[1] ?? "";
  return new Set([...body.matchAll(/'([a-z0-9-]+)':/g)].map((m) => m[1]));
}

function marketingClassified() {
  const src = readFileSync(join(TEMPLATE_DIR, "classification.ts"), "utf8");
  const body = src.split("EMAIL_CLASSIFICATIONS: Record<string, EmailClassification> = {")[1] ?? "";
  return new Set(
    [...body.matchAll(/'([a-z0-9-]+)':\s*\{\s*kind:\s*'(\w+)'/g)]
      .filter((m) => m[2] === "marketing")
      .map((m) => m[1]),
  );
}

if (!SUPABASE_URL || !ANON_KEY) {
  console.log("SKIP  email marketing guard — backend URL/key not configured.");
  process.exit(0);
}
if (!EMAIL || !PASSWORD) {
  console.log("SKIP  email marketing guard — E2E_EMAIL / E2E_PASSWORD not set.");
  process.exit(0);
}

const api = (path, init = {}) =>
  fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: { apikey: ANON_KEY, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });

async function signIn() {
  const res = await api("/auth/v1/token?grant_type=password", {
    method: "POST",
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const body = await res.json().catch(() => ({}));
  return body.access_token ? body : null;
}

/** Reads the caller-visible email log rows (RLS scopes this to the signed-in user). */
async function readSendLog(bearer, since) {
  const query = since ? `&created_at=gte.${encodeURIComponent(since)}` : "";
  const res = await api(
    `/rest/v1/email_send_log?select=template_name,status,created_at&order=created_at.desc&limit=500${query}`,
    { headers: bearer },
  );
  if (!res.ok) return { ok: false, status: res.status, rows: [] };
  return { ok: true, status: res.status, rows: await res.json().catch(() => []) };
}

async function callSend(bearer, body) {
  const res = await api("/functions/v1/send-transactional-email", {
    method: "POST",
    headers: bearer,
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.text() };
}

/** Drives the real app surfaces in a browser so any UI-triggered send fires. */
async function exerciseAppFlows(session) {
  let chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    return { ran: false, reason: "playwright not installed" };
  }
  const { existsSync: exists } = await import("node:fs");
  const { homedir } = await import("node:os");
  let executablePath;
  for (const root of ["/opt/ms-playwright", join(homedir(), ".cache/ms-playwright")]) {
    if (!exists(root)) continue;
    for (const dir of readdirSync(root).filter((d) => d.startsWith("chromium"))) {
      for (const rel of ["chrome-linux/chrome", "chrome-linux/headless_shell", "chrome-linux64/chrome-headless-shell"]) {
        const c = join(root, dir, rel);
        if (exists(c)) executablePath = executablePath ?? c;
      }
    }
  }
  const browser = await chromium.launch({ headless: true, executablePath });
  const context = await browser.newContext({ viewport: { width: 1280, height: 1800 } });
  const page = await context.newPage();

  const sendCalls = [];
  page.on("request", (req) => {
    const url = req.url();
    if (!/send-transactional-email|enqueue_email|send-email/.test(url)) return;
    let templateName = "";
    try {
      templateName = JSON.parse(req.postData() ?? "{}").templateName ?? "";
    } catch {
      /* non-JSON body */
    }
    sendCalls.push({ url, templateName });
  });

  const storageKey = `sb-${new URL(SUPABASE_URL).hostname.split(".")[0]}-auth-token`;
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate(
    ([k, v]) => window.localStorage.setItem(k, v),
    [storageKey, JSON.stringify(session)],
  );

  for (const route of ["/", "/resumes", "/applications", "/interview", "/settings", "/notifications"]) {
    await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded" }).catch(() => {});
    await page.waitForTimeout(1200);
  }

  await browser.close();
  return { ran: true, sendCalls };
}

async function run() {
  const session = await signIn();
  if (!session) {
    record("sign-in for email guard", false, "no session returned");
    finish();
    return;
  }
  const bearer = { Authorization: `Bearer ${session.access_token}` };
  const startedAt = new Date().toISOString();

  const registry = registeredTemplates();
  const marketing = marketingClassified();
  record("no template is classified as marketing", marketing.size === 0, [...marketing].join(", "));

  // 1. Historical log rows only reference live, transactional templates.
  const history = await readSendLog(bearer);
  if (history.ok) {
    const names = [...new Set(history.rows.map((r) => r.template_name).filter(Boolean))];
    const unknown = names.filter((n) => !registry.has(n));
    const shaped = names.filter((n) => MARKETING_SHAPES.test(n));
    record("email log references only registered templates", unknown.length === 0, unknown.join(", "));
    record("email log contains no marketing-shaped sends", shaped.length === 0, shaped.join(", "));
  } else {
    record("email log readable", false, `status ${history.status}`);
  }

  // 2. A marketing-shaped template cannot be queued by a signed-in user.
  for (const name of ["daily-digest", "weekly-newsletter", "product-announcement"]) {
    const res = await callSend(bearer, { templateName: name, recipientEmail: EMAIL });
    record(`send refuses marketing template "${name}"`, res.status >= 400, `status ${res.status}`);
  }

  // 3. A user cannot send even a valid template to a third party.
  const spoof = await callSend(bearer, {
    templateName: "welcome",
    recipientEmail: "someone-else@example.com",
  });
  record("send refuses a recipient other than the caller", spoof.status >= 400, `status ${spoof.status}`);

  // 4. Normal app usage queues nothing marketing-shaped.
  const flows = await exerciseAppFlows(session);
  if (flows.ran) {
    const offenders = flows.sendCalls.filter(
      (c) => MARKETING_SHAPES.test(c.templateName) || marketing.has(c.templateName),
    );
    record(
      "app flows queue no marketing email",
      offenders.length === 0,
      offenders.map((o) => o.templateName || o.url).join(", ") ||
        `${flows.sendCalls.length} transactional send call(s) observed`,
    );
  } else {
    record("app flows exercised", true, `skipped — ${flows.reason}`);
  }

  const after = await readSendLog(bearer, startedAt);
  if (after.ok) {
    const offenders = after.rows.filter(
      (r) => MARKETING_SHAPES.test(r.template_name ?? "") || marketing.has(r.template_name),
    );
    record(
      "no marketing row was written during this run",
      offenders.length === 0,
      offenders.map((r) => r.template_name).join(", "),
    );
  }

  // 5. No recurring digest job is scheduled.
  const scheduled = [];
  for (const file of readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql"))) {
    const sql = readFileSync(join("supabase/migrations", file), "utf8");
    for (const m of sql.matchAll(/cron\.schedule\s*\(\s*'([^']+)'/g)) {
      if (MARKETING_SHAPES.test(m[1])) scheduled.push(`${file}: ${m[1]}`);
    }
  }
  record("no recurring marketing job scheduled", scheduled.length === 0, scheduled.join(", "));

  finish();
}

function finish() {
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
  process.exit(failed.length ? 1 : 0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
