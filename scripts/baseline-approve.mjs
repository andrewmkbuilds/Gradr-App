#!/usr/bin/env node
/**
 * Review and lock theme pixel baselines.
 *
 * Workflow:
 *   1. bun run test:visual:themes:update     # captures land in .../pending/
 *   2. bun run visual:baseline:review        # list what is waiting, with diff %
 *   3. bun run visual:baseline:approve -- --all --reviewer "Andrew" --reason "New sidebar spacing"
 *
 * Approval copies the pending PNG over the baseline and records its sha256,
 * reviewer, timestamp and reason in tests/visual/themes/baselines.lock.json.
 * Any later edit to a baseline that is not re-approved fails the diff run.
 */
import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";
import {
  THEME_BASELINE_DIR,
  THEME_PENDING_DIR,
  approveBaseline,
  hashFile,
  loadManifest,
  saveManifest,
  verifyLocks,
} from "./lib/visualBaselines.mjs";

const ROOT = process.cwd();
const args = process.argv.slice(2);
const has = (flag) => args.includes(flag);
const value = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};

const pendingDir = join(ROOT, THEME_PENDING_DIR);
const pending = existsSync(pendingDir) ? readdirSync(pendingDir).filter((f) => f.endsWith(".png")) : [];
const manifest = loadManifest(ROOT);

/** Percentage of pixels that differ between the pending capture and the live baseline. */
function driftPercent(file) {
  const baseline = join(ROOT, THEME_BASELINE_DIR, file);
  if (!existsSync(baseline)) return null; // brand-new capture
  const a = PNG.sync.read(readFileSync(baseline));
  const b = PNG.sync.read(readFileSync(join(pendingDir, file)));
  if (a.width !== b.width || a.height !== b.height) return 100;
  const changed = pixelmatch(a.data, b.data, null, a.width, a.height, { threshold: 0.15 });
  return (changed / (a.width * a.height)) * 100;
}

function review() {
  const baselines = existsSync(join(ROOT, THEME_BASELINE_DIR))
    ? readdirSync(join(ROOT, THEME_BASELINE_DIR)).filter((f) => f.endsWith(".png"))
    : [];
  const { unlocked, mismatched } = verifyLocks(baselines, { root: ROOT, manifest });

  console.log(`Locked baselines: ${baselines.length - unlocked.length - mismatched.length}/${baselines.length}`);
  for (const file of mismatched) {
    console.log(`  LOCK MISMATCH  ${file} — edited without approval (re-approve or restore)`);
  }
  for (const file of unlocked) console.log(`  UNLOCKED       ${file} — never approved`);

  if (!pending.length) {
    console.log("\nNothing pending review.");
    return;
  }
  console.log(`\nPending review (${pending.length}):`);
  for (const file of pending) {
    const drift = driftPercent(file);
    console.log(`  ${file}  ${drift === null ? "NEW capture" : `${drift.toFixed(2)}% pixels changed`}`);
  }
  console.log(
    "\nInspect tests/visual/themes/pending vs baseline, then approve:\n" +
      '  bun run visual:baseline:approve -- --all --reviewer "Your Name" --reason "why this drift is intended"',
  );
}

function approve() {
  const reviewer = value("--reviewer") ?? process.env.GITHUB_ACTOR;
  const reason = value("--reason");
  if (!reviewer || !reason) {
    console.error('Approval requires --reviewer "Name" and --reason "why this change is intended".');
    process.exit(1);
  }
  const targets = has("--all") ? pending : args.filter((a) => a.endsWith(".png"));
  if (!targets.length) {
    console.error("Nothing to approve. Pass --all or explicit <name>.png files.");
    process.exit(1);
  }

  for (const file of targets) {
    const drift = driftPercent(file);
    const entry = approveBaseline(file, { reviewer, reason, root: ROOT, manifest });
    rmSync(join(pendingDir, file), { force: true });
    console.log(
      `approved ${file}  ${drift === null ? "(new)" : `(${drift.toFixed(2)}% drift)`}  sha ${entry.sha256.slice(0, 12)}`,
    );
  }
  const file = saveManifest(manifest, ROOT);
  console.log(`\nLocked ${targets.length} baseline(s) in ${file}. Commit the PNGs and the lock file together.`);
}

/** Re-locks baselines that were changed on disk without going through pending. */
function relock() {
  const reviewer = value("--reviewer") ?? process.env.GITHUB_ACTOR;
  const reason = value("--reason");
  if (!reviewer || !reason) {
    console.error('Re-lock requires --reviewer and --reason.');
    process.exit(1);
  }
  const baselines = readdirSync(join(ROOT, THEME_BASELINE_DIR)).filter((f) => f.endsWith(".png"));
  const { unlocked, mismatched } = verifyLocks(baselines, { root: ROOT, manifest });
  for (const file of [...unlocked, ...mismatched]) {
    manifest.baselines[file] = {
      sha256: hashFile(join(ROOT, THEME_BASELINE_DIR, file)),
      approvedBy: reviewer,
      approvedAt: new Date().toISOString(),
      reason,
    };
    console.log(`re-locked ${file}`);
  }
  saveManifest(manifest, ROOT);
}

if (has("--approve")) approve();
else if (has("--relock")) relock();
else review();
