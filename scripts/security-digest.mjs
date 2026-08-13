#!/usr/bin/env node
/**
 * Weekly security digest driver.
 *
 * Two steps, both against the deployed origin:
 *  1. `--ingest <snapshot.json> [--diff diff.json]` — hand the fingerprint
 *     snapshot CI just captured (plus the workflow run / artifact URLs) to the
 *     backend so the digest can link at the exact evidence.
 *  2. `--send` — build and deliver the Slack/email digest.
 *
 * Usage:
 *   CRON_SECRET=… node scripts/security-digest.mjs --ingest /tmp/head.json \
 *     --run-url "$RUN_URL" --artifact-url "$ARTIFACT_URL"
 *   CRON_SECRET=… node scripts/security-digest.mjs --send [--dry-run]
 */
import { readFileSync } from "node:fs";
import process from "node:process";

const args = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};

const ORIGIN = (process.env.GRADR_ORIGIN ?? "https://gradr.me").replace(/\/$/, "");
const SECRET = process.env.CRON_SECRET;
if (!SECRET) {
  console.error("CRON_SECRET is required to call the security digest endpoint.");
  process.exit(2);
}

async function call(body) {
  const res = await fetch(`${ORIGIN}/api/public/security-digest`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-cron-secret": SECRET },
    body: JSON.stringify(body),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error(`Security digest ${body.action} failed [${res.status}]:`, JSON.stringify(payload));
    process.exit(1);
  }
  return payload;
}

/** Flattens a snapshot into comparable "route → signal" strings. */
function signalStrings(snapshot) {
  const out = [];
  for (const [route, entry] of Object.entries(snapshot?.routes ?? {})) {
    for (const [header, value] of Object.entries(entry?.headers ?? {})) {
      out.push(`${route} header ${header}: ${value}`);
    }
    for (const tag of entry?.head ?? []) out.push(`${route} head ${tag}`);
  }
  return out;
}

const snapshotPath = flag("ingest");
if (snapshotPath) {
  const snapshot = JSON.parse(readFileSync(snapshotPath, "utf8"));
  const diffPath = flag("diff");
  const diff = diffPath ? JSON.parse(readFileSync(diffPath, "utf8")) : null;
  const changes = diff?.changes ?? [];
  const pick = (kind) => changes.filter((c) => c.kind === kind).map((c) => `${c.section}: ${c.detail}`);

  const result = await call({
    action: "ingest",
    origin: snapshot.origin ?? snapshot.base ?? ORIGIN,
    source: "ci",
    commitSha: process.env.GITHUB_SHA ?? null,
    branch: process.env.GITHUB_REF_NAME ?? null,
    runId: process.env.GITHUB_RUN_ID ?? null,
    runUrl: flag("run-url"),
    artifactUrl: flag("artifact-url"),
    signalCount: signalStrings(snapshot).length,
    added: pick("added"),
    removed: pick("removed"),
    changed: pick("changed"),
    signals: snapshot,
  });
  console.log(`Fingerprint snapshot stored: ${result.snapshot?.id ?? "unknown"}`);
}

if (args.includes("--send")) {
  const result = await call({ action: "send", dryRun: args.includes("--dry-run") });
  const d = result.digest ?? {};
  console.log(`Weekly security digest — ${d.headline ?? "no summary"}`);
  console.log(`  window:        ${d.period?.start?.slice(0, 10)} → ${d.period?.end?.slice(0, 10)}`);
  console.log(`  CSP reports:   ${d.csp?.reports?.current} (${d.csp?.reports?.pct} vs previous week)`);
  console.log(`  critical:      ${d.csp?.criticalReports?.current}`);
  console.log(`  new combos:    ${d.csp?.newCombos?.length ?? 0}`);
  console.log(`  fingerprint:   +${d.fingerprint?.added?.length ?? 0} / -${d.fingerprint?.removed?.length ?? 0} / ~${d.fingerprint?.changed?.length ?? 0}`);
  for (const link of d.links ?? []) console.log(`   • ${link.label}: ${link.url}`);
  console.log(`  delivery:      ${result.deliveryError ?? "sent"}`);
  if (result.deliveryError && result.deliveryError !== "dry-run") process.exit(1);
}
