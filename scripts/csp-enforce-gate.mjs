#!/usr/bin/env node
/**
 * The enforce-CSP readiness gate.
 *
 * Flipping `Content-Security-Policy-Report-Only` to enforced is irreversible
 * from the user's point of view — a missed origin means broken sign-in, a dead
 * Supabase socket or an uninstallable PWA. So the flip is gated on evidence:
 * a full week with **zero** critical violations across auth, Supabase and PWA
 * routes, measured from the live violation reports.
 *
 * Exit codes: 0 = ready (or already enforced), 1 = not ready, 2 = misconfigured.
 * CI sets `CSP_ENFORCE=true` only when this exits 0 with `shouldPromote`.
 *
 * Usage: CRON_SECRET=… node scripts/csp-enforce-gate.mjs [origin]
 */
import process from "node:process";

const ORIGIN = (process.argv[2] ?? process.env.GRADR_ORIGIN ?? "https://gradr.me").replace(/\/$/, "");
const SECRET = process.env.CRON_SECRET;

if (!SECRET) {
  console.error("CRON_SECRET is required to call the CSP readiness endpoint.");
  process.exit(2);
}

const res = await fetch(`${ORIGIN}/api/public/csp-alerts`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "x-cron-secret": SECRET },
  body: JSON.stringify({ action: "readiness", days: 14 }),
});

const payload = await res.json().catch(() => ({}));
if (!res.ok) {
  console.error(`Readiness check failed [${res.status}]:`, JSON.stringify(payload));
  process.exit(2);
}

console.log(`CSP mode: ${payload.mode}`);
console.log(`Clean days: ${payload.cleanDays}/${payload.requiredCleanDays}`);
for (const surface of payload.surfaces ?? []) {
  console.log(
    `  ${surface.clean ? "✅" : "❌"} ${surface.label}: ${surface.violations} violation(s)` +
      (surface.lastViolationAt ? ` — latest ${surface.lastViolationAt}` : ""),
  );
}
console.log(payload.summary);

const lines = [
  "## CSP enforcement gate",
  "",
  `- Mode: **${payload.mode}**`,
  `- Clean days: **${payload.cleanDays}/${payload.requiredCleanDays}**`,
  ...(payload.surfaces ?? []).map(
    (s) => `- ${s.clean ? "✅" : "❌"} ${s.label}: ${s.violations} violation(s)`,
  ),
  "",
  payload.shouldPromote
    ? "**Ready to enforce.** Set `CSP_ENFORCE=true` and redeploy."
    : payload.enforced
      ? "Already enforcing the candidate policy."
      : "Not ready — staying in report-only.",
  "",
];
if (process.env.GITHUB_STEP_SUMMARY) {
  const { appendFileSync } = await import("node:fs");
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join("\n"));
}
if (process.env.GITHUB_OUTPUT) {
  const { appendFileSync } = await import("node:fs");
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    `ready=${payload.ready ? "true" : "false"}\nshould_promote=${payload.shouldPromote ? "true" : "false"}\n`,
  );
}

for (const blocker of payload.blockers ?? []) console.error(`Blocker: ${blocker}`);
process.exit(payload.ready || payload.enforced ? 0 : 1);
