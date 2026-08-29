#!/usr/bin/env node
/**
 * Accessibility merge gate: fails only on *new* blocking findings.
 *
 * `scripts/a11y-audit.mjs` reports every violation it can see. This script is
 * the gate: it compares the freshly written report against the committed
 * baseline for the same surface and exits non-zero only when a blocking
 * finding (serious/critical impact, or one of the audit's gated rules) appears
 * that the baseline does not already record. Pre-existing findings stay
 * visible in the report and in this output, but they do not block a merge —
 * so a PR is judged on the accessibility it changes, not the debt it inherits.
 *
 * Usage:
 *   node scripts/a11y-baseline-diff.mjs app.gradr.me gradr.me
 *   node scripts/a11y-baseline-diff.mjs --update app.gradr.me   # re-record
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

const args = process.argv.slice(2);
const UPDATE = args.includes("--update");
const flag = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const OUT_DIR = flag("out", "reports/a11y");
const BASELINE_DIR = flag("baseline", join(OUT_DIR, "baseline"));
const labels = args.filter((a) => !a.startsWith("--"));

if (!labels.length) {
  console.error("usage: a11y-baseline-diff.mjs [--update] <label> [label...]");
  process.exit(2);
}

/**
 * Fingerprint deliberately omits viewport and theme: the same broken element
 * reported at 390px/light and 1440px/dark is one defect, and a baseline keyed
 * on the matrix would go stale the moment a breakpoint moves.
 */
const fingerprint = (v, selector) => `${v.id}|${v.route}|${selector}`;

const collect = (report) => {
  const set = new Set();
  for (const v of report.violations ?? []) {
    if (!v.blocking) continue;
    for (const n of v.nodes ?? []) set.add(fingerprint(v, n.selector));
  }
  return set;
};

let failed = false;

for (const label of labels) {
  const reportPath = join(OUT_DIR, `${label}.json`);
  const baselinePath = join(BASELINE_DIR, `${label}.json`);

  if (!existsSync(reportPath)) {
    console.error(`✖ ${label}: no report at ${reportPath} — run the audit first.`);
    failed = true;
    continue;
  }

  const report = JSON.parse(readFileSync(reportPath, "utf8"));
  const current = collect(report);

  if (UPDATE) {
    mkdirSync(BASELINE_DIR, { recursive: true });
    writeFileSync(
      baselinePath,
      `${JSON.stringify(
        {
          label,
          target: report.target,
          recordedAt: new Date().toISOString(),
          note: "Accepted blocking findings. New entries block a merge; removing one is always safe.",
          blocking: [...current].sort(),
        },
        null,
        2,
      )}\n`,
    );
    console.log(`↻ ${label}: baseline recorded with ${current.size} accepted blocking finding(s).`);
    continue;
  }

  const baseline = existsSync(baselinePath)
    ? new Set(JSON.parse(readFileSync(baselinePath, "utf8")).blocking ?? [])
    : new Set();

  const added = [...current].filter((f) => !baseline.has(f));
  const fixed = [...baseline].filter((f) => !current.has(f));

  console.log(
    `\n${label}: ${current.size} blocking finding(s) now, ${baseline.size} in baseline · ${added.length} new · ${fixed.length} resolved`,
  );
  for (const f of fixed) console.log(`  ✓ resolved  ${f}`);
  for (const f of added) console.log(`  ✖ NEW       ${f}`);

  if (added.length) failed = true;
}

if (failed) {
  console.error("\n✖ New serious/critical accessibility findings introduced — see the uploaded report artifacts.");
  process.exit(1);
}
console.log("\n✓ No new blocking accessibility findings.");
