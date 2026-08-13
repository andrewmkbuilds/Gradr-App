#!/usr/bin/env node
/**
 * CI gate: signed-out visitors must never hit `public.has_role`, and key public
 * pages must load without a permission-denied error.
 *
 * Two independent checks:
 *  1. Static policy audit — no policy that the `anon` role can evaluate may
 *     reference has_role(). Needs DATABASE_URL; skipped when absent.
 *  2. Live page load — fetch the public routes anonymously and fail on any
 *     "permission denied" / 42501 marker in the HTML.
 *
 * Usage: BASE_URL=https://gradr.me DATABASE_URL=postgres://... node scripts/anon-permission-check.mjs
 */
import { query, dbConfigured } from "./securityBaseline.mjs";

const BASE_URL = (process.env.BASE_URL || "http://localhost:8080").replace(/\/$/, "");
const PUBLIC_ROUTES = [
  "/",
  "/pricing",
  "/auth",
  "/blog",
  "/ai-interview-coach",
  "/ats-resume-checker",
  "/privacy",
  "/terms",
  "/status",
];
const DENIED = /permission denied|42501|must be owner of/i;

let failures = 0;

if (dbConfigured()) {
  const rows = query(
    `select tablename, policyname, coalesce(array_to_string(roles, ','), '') as roles,
            coalesce(qual, '') || ' ' || coalesce(with_check, '') as expr
       from pg_policies where schemaname = 'public'`,
  );
  const offenders = rows.filter(([, , roles, expr]) => {
    const scoped = roles.split(",").map((r) => r.trim());
    const anonCanRun = scoped.includes("anon") || scoped.includes("public") || scoped.includes("");
    return anonCanRun && /has_role\s*\(/i.test(expr);
  });
  for (const [table, policy] of offenders) {
    console.log(`FAIL  policy ${table}.${policy} lets anon evaluate has_role()`);
    failures++;
  }
  console.log(`${offenders.length ? "" : "ok    "}anon-visible policies checked: ${rows.length}`);
} else {
  console.log("skip  policy audit (no DATABASE_URL)");
}

for (const route of PUBLIC_ROUTES) {
  const url = `${BASE_URL}${route}`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": "gradr-anon-permission-check" } });
    const body = await res.text();
    const denied = DENIED.test(body);
    if (!res.ok || denied) {
      console.log(`FAIL  ${route} — HTTP ${res.status}${denied ? " + permission denied in body" : ""}`);
      failures++;
    } else {
      console.log(`ok    ${route} — HTTP ${res.status}`);
    }
  } catch (e) {
    console.log(`FAIL  ${route} — ${e instanceof Error ? e.message : e}`);
    failures++;
  }
}

if (failures) {
  console.log(`\n${failures} anonymous-access check(s) failed.`);
  process.exit(1);
}
console.log("\nAll anonymous access checks passed.");
