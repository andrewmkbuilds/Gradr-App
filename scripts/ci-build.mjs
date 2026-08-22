#!/usr/bin/env node
/**
 * Clean-install production build with explicit, readable error reporting.
 *
 * Steps:
 *   1. Remove node_modules (and optionally bun's cache artifacts in the repo).
 *   2. `bun install --frozen-lockfile` — the lockfile is authoritative in CI.
 *   3. `bun run build` — prebuild guardrails + typecheck + vite build.
 *
 * Usage:
 *   node scripts/ci-build.mjs            # clean reinstall, then build
 *   node scripts/ci-build.mjs --no-clean # keep node_modules (fast local rerun)
 *   node scripts/ci-build.mjs --install-only
 */
import { spawnSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const argv = process.argv.slice(2);
const CLEAN = !argv.includes("--no-clean");
const INSTALL_ONLY = argv.includes("--install-only");

const started = Date.now();

function section(title) {
  console.log(`\n\u001b[1m▶ ${title}\u001b[0m`);
}

function fail(step, detail) {
  console.error(`\n\u001b[31m✗ CI build failed at: ${step}\u001b[0m`);
  if (detail) console.error(`  ${detail}`);
  console.error(
    [
      "",
      "How to reproduce locally:",
      "  rm -rf node_modules && bun install --frozen-lockfile && bun run build",
      "",
      "Common causes:",
      "  - lockfile out of sync with package.json (run `bun install` and commit bun.lock)",
      "  - a guardrail in `prebuild` failed (icons, TanStack, tailwind classes, legacy design)",
      "  - TypeScript errors (`bun run typecheck`)",
      "",
    ].join("\n"),
  );
  process.exit(1);
}

function run(step, cmd, args) {
  section(`${step} — ${cmd} ${args.join(" ")}`);
  const res = spawnSync(cmd, args, { cwd: ROOT, stdio: "inherit", env: process.env });
  if (res.error) fail(step, res.error.message);
  if (res.status !== 0) fail(step, `exited with code ${res.status}`);
  console.log(`\u001b[32m✓ ${step}\u001b[0m`);
}

if (CLEAN) {
  section("clean — removing node_modules");
  const dir = resolve(ROOT, "node_modules");
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
    console.log("  removed node_modules");
  } else {
    console.log("  node_modules already absent");
  }
  console.log("\u001b[32m✓ clean\u001b[0m");
}

run("install", "bun", ["install", "--frozen-lockfile"]);

if (!INSTALL_ONLY) {
  run("build", "bun", ["run", "build"]);
}

console.log(
  `\n\u001b[32m✓ CI build succeeded\u001b[0m in ${((Date.now() - started) / 1000).toFixed(1)}s`,
);
