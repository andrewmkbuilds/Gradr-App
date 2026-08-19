#!/usr/bin/env node
/**
 * Runs the sandbox payments end-to-end smoke test (catalog → checkout →
 * signed webhook → entitlement grant) and prints each step.
 *
 * Auth: set PAYMENTS_CRON_SECRET (the project's CRON_SECRET) or
 * SUPABASE_USER_TOKEN (an admin access token).
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const envFile = existsSync(path.join(ROOT, ".env"))
  ? readFileSync(path.join(ROOT, ".env"), "utf8")
  : "";
const fromEnv = (k) =>
  process.env[k] || envFile.split("\n").find((l) => l.startsWith(`${k}=`))?.slice(k.length + 1).trim();

const url = fromEnv("VITE_SUPABASE_URL");
const anon = fromEnv("VITE_SUPABASE_PUBLISHABLE_KEY");
if (!url || !anon) {
  console.error("✖ Missing VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY");
  process.exit(1);
}

const headers = { "Content-Type": "application/json", apikey: anon };
if (process.env.PAYMENTS_CRON_SECRET) headers["x-cron-secret"] = process.env.PAYMENTS_CRON_SECRET;
if (process.env.SUPABASE_USER_TOKEN) headers.Authorization = `Bearer ${process.env.SUPABASE_USER_TOKEN}`;
if (!headers["x-cron-secret"] && !headers.Authorization) {
  console.error("✖ Set PAYMENTS_CRON_SECRET or SUPABASE_USER_TOKEN to authenticate.");
  process.exit(1);
}

const res = await fetch(`${url}/functions/v1/payments-smoke-test`, {
  method: "POST",
  headers,
  body: "{}",
});
const body = await res.json().catch(() => ({ error: "non-JSON response" }));

for (const step of body.steps ?? []) {
  console.log(`${step.ok ? "✓" : "✖"} ${step.name}${step.detail ? ` — ${step.detail}` : ""}`);
}

if (!body.ok) {
  console.error(`\n✖ Payments smoke test failed (HTTP ${res.status})`);
  if (body.error) console.error(`  ${body.error}`);
  process.exit(1);
}
console.log("\n✓ Payments flow healthy (sandbox)");
