#!/usr/bin/env node
/**
 * CI preflight for the scheduled CSP and fingerprint jobs.
 *
 * These jobs fail late and cryptically when a repo secret or variable is
 * missing — a 401 from the alert endpoint, or a diff taken against production
 * twice. This runs first and fails with instructions instead.
 *
 * Usage: node scripts/ci-preflight.mjs csp|fingerprint
 */
import process from "node:process";

const job = (process.argv[2] ?? "csp").toLowerCase();

const REQUIREMENTS = {
  csp: [
    {
      name: "CRON_SECRET",
      kind: "secret",
      why: "authenticates the scheduled call to /api/public/csp-alerts.",
      fix: "Settings → Secrets and variables → Actions → New repository secret. Use the same value as the CRON_SECRET configured on the deployed backend.",
      required: true,
    },
    {
      name: "GRADR_ORIGIN",
      kind: "variable",
      why: "the deployed origin the monitor calls.",
      fix: "Settings → Secrets and variables → Actions → Variables → GRADR_BASE_ORIGIN (defaults to https://gradr.me).",
      required: false,
      fallback: "https://gradr.me",
    },
  ],
  fingerprint: [
    {
      name: "GRADR_BASE_ORIGIN",
      kind: "variable",
      why: "the production origin used as the diff baseline.",
      fix: "Settings → Secrets and variables → Actions → Variables → GRADR_BASE_ORIGIN.",
      required: false,
      fallback: "https://gradr.me",
    },
    {
      name: "GRADR_PREVIEW_ORIGIN",
      kind: "variable",
      why: "the branch preview origin. Without it the diff compares production against itself and always reports zero changes.",
      fix: "Settings → Secrets and variables → Actions → Variables → GRADR_PREVIEW_ORIGIN, e.g. https://project--<id>-dev.lovable.app. Or pass head_origin when dispatching the workflow manually.",
      required: true,
    },
  ],
};

const checks = REQUIREMENTS[job];
if (!checks) {
  console.error(`Unknown preflight job "${job}". Expected: ${Object.keys(REQUIREMENTS).join(", ")}`);
  process.exit(2);
}

const missing = [];
const warnings = [];

for (const check of checks) {
  const value = process.env[check.name];
  if (value && value.trim()) {
    console.log(`✅ ${check.name} is set (${check.kind}).`);
    continue;
  }
  if (check.required) missing.push(check);
  else {
    warnings.push(check);
    console.log(`ℹ️  ${check.name} not set — falling back to ${check.fallback}.`);
  }
}

const summary = [`## CI preflight — ${job}`, ""];
for (const w of warnings) summary.push(`- ℹ️ \`${w.name}\` unset, using \`${w.fallback}\``);

if (missing.length === 0) {
  summary.push("- ✅ All required configuration is present.", "");
  if (process.env.GITHUB_STEP_SUMMARY) {
    const { appendFileSync } = await import("node:fs");
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary.join("\n"));
  }
  console.log(`Preflight passed for "${job}".`);
  process.exit(0);
}

console.error(`\n❌ Preflight failed for "${job}" — ${missing.length} missing configuration value(s):\n`);
for (const m of missing) {
  console.error(`  • ${m.name} (${m.kind})`);
  console.error(`      why: ${m.why}`);
  console.error(`      fix: ${m.fix}\n`);
  summary.push(`- ❌ **${m.name}** (${m.kind}) — ${m.why}`, `  - Fix: ${m.fix}`);
}
summary.push("", "The scheduled job was skipped rather than run with incomplete configuration.", "");

if (process.env.GITHUB_STEP_SUMMARY) {
  const { appendFileSync } = await import("node:fs");
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary.join("\n"));
}
process.exit(1);
