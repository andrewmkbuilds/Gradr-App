/**
 * Approval + lock bookkeeping for theme pixel baselines.
 *
 * A baseline PNG is only trusted when its sha256 is recorded in the manifest
 * together with who approved it and why. Captures produced by `--update` land
 * in tests/visual/themes/pending/ and stay there until a human promotes them
 * with scripts/baseline-approve.mjs — that is the one-time review step.
 *
 * Because the manifest stores the hash, an unreviewed edit to a baseline file
 * (a stray `--update`, a bad merge) fails the run as "lock mismatch" instead of
 * silently redefining what "correct" looks like.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const THEME_BASELINE_DIR = "tests/visual/themes/baseline";
export const THEME_PENDING_DIR = "tests/visual/themes/pending";
export const THEME_CURRENT_DIR = "tests/visual/themes/current";
export const THEME_MANIFEST = "tests/visual/themes/baselines.lock.json";

export const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");
export const hashFile = (path) => sha256(readFileSync(path));

export function loadManifest(root = process.cwd()) {
  const file = join(root, THEME_MANIFEST);
  if (!existsSync(file)) return { version: 1, baselines: {} };
  const parsed = JSON.parse(readFileSync(file, "utf8"));
  return { version: parsed.version ?? 1, baselines: parsed.baselines ?? {} };
}

export function saveManifest(manifest, root = process.cwd()) {
  const file = join(root, THEME_MANIFEST);
  mkdirSync(dirname(file), { recursive: true });
  const baselines = Object.fromEntries(
    Object.entries(manifest.baselines).sort(([a], [b]) => a.localeCompare(b)),
  );
  writeFileSync(file, JSON.stringify({ version: manifest.version ?? 1, baselines }, null, 2) + "\n");
  return file;
}

/**
 * Verifies every committed baseline against its lock entry.
 * @returns {{ locked: string[], unlocked: string[], mismatched: string[] }}
 */
export function verifyLocks(files, { root = process.cwd(), manifest = loadManifest(root) } = {}) {
  const locked = [];
  const unlocked = [];
  const mismatched = [];
  for (const file of files) {
    const path = join(root, THEME_BASELINE_DIR, file);
    if (!existsSync(path)) continue;
    const entry = manifest.baselines[file];
    if (!entry) unlocked.push(file);
    else if (entry.sha256 !== hashFile(path)) mismatched.push(file);
    else locked.push(file);
  }
  return { locked, unlocked, mismatched };
}

/** Promotes a pending capture to baseline and records the approval. */
export function approveBaseline(file, { reviewer, reason, root = process.cwd(), manifest }) {
  const pending = join(root, THEME_PENDING_DIR, file);
  if (!existsSync(pending)) throw new Error(`no pending capture for ${file}`);
  const buffer = readFileSync(pending);
  const target = join(root, THEME_BASELINE_DIR, file);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, buffer);
  manifest.baselines[file] = {
    sha256: sha256(buffer),
    approvedBy: reviewer,
    approvedAt: new Date().toISOString(),
    reason,
  };
  return manifest.baselines[file];
}
