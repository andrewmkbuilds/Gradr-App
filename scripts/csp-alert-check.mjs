#!/usr/bin/env node
/**
 * Runs the CSP report-only alert evaluation against a deployed origin.
 *
 * Fires Slack/email alerts for violation spikes and for directive/origin pairs
 * never seen before, then prints a summary for the CI log. Deduping lives
 * server-side, so this can run on a schedule without spamming anyone.
 *
 * Usage: CRON_SECRET=… node scripts/csp-alert-check.mjs [origin] [--dry-run] [--days 14]
 */
import process from "node:process";

const args = process.argv.slice(2);
const positional = args.filter((a) => !a.startsWith("--"));
const flagValue = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};

const ORIGIN = (positional[0] ?? process.env.GRADR_ORIGIN ?? "https://gradr.me").replace(/\/$/, "");
const SECRET = process.env.CRON_SECRET;
const days = Number(flagValue("days", 14));
const dryRun = args.includes("--dry-run");

if (!SECRET) {
  console.error("CRON_SECRET is required to call the CSP alert endpoint.");
  process.exit(2);
}

const res = await fetch(`${ORIGIN}/api/public/csp-alerts`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "x-cron-secret": SECRET },
  body: JSON.stringify({ action: "check", days, dryRun }),
});

const payload = await res.json().catch(() => ({}));
if (!res.ok) {
  console.error(`CSP alert check failed [${res.status}]:`, JSON.stringify(payload));
  process.exit(1);
}

console.log(`CSP alert check @ ${payload.checkedAt}`);
console.log(`  window:        last ${payload.windowHours}h of a ${payload.baselineDays}d baseline`);
console.log(`  reports:       ${payload.recentTotal} in window`);
console.log(`  spikes:        ${payload.spikes}`);
console.log(`  new combos:    ${payload.newCombos}`);
console.log(`  alerts sent:   ${payload.alertsSent?.length ?? 0} (suppressed ${payload.alertsSuppressed ?? 0})`);
for (const alert of payload.alertsSent ?? []) {
  console.log(`   • [${alert.kind}] ${alert.headline}${alert.error ? ` (delivery: ${alert.error})` : ""}`);
}
console.log(`  readiness:     ${payload.readiness?.summary}`);

if (process.env.GITHUB_STEP_SUMMARY) {
  const { appendFileSync } = await import("node:fs");
  appendFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    [
      "## CSP monitor",
      "",
      `- Reports in last ${payload.windowHours}h: **${payload.recentTotal}**`,
      `- Spikes: **${payload.spikes}** · New directive/origin pairs: **${payload.newCombos}**`,
      `- Alerts sent: **${payload.alertsSent?.length ?? 0}**`,
      `- Readiness: ${payload.readiness?.ready ? "✅" : "⏳"} ${payload.readiness?.summary}`,
      "",
    ].join("\n"),
  );
}
