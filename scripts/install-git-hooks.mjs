#!/usr/bin/env node
/**
 * Points git at the versioned hooks in .githooks so every clone gets the
 * pre-commit architecture guard. Safe to run repeatedly; silently no-ops
 * outside a git working tree (CI checkouts, tarball installs).
 */
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const HOOKS_DIR = ".githooks";

if (!existsSync(".git") || !existsSync(HOOKS_DIR)) {
  process.exit(0);
}

try {
  for (const file of readdirSync(HOOKS_DIR)) {
    chmodSync(join(HOOKS_DIR, file), 0o755);
  }
  execFileSync("git", ["config", "core.hooksPath", HOOKS_DIR], { stdio: "ignore" });
  console.log(`git hooks installed from ${HOOKS_DIR}/`);
} catch {
  // Never fail an install because hooks could not be wired up.
}
