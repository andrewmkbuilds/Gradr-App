#!/usr/bin/env node
/**
 * Build-error gate.
 *
 * The platform appends one timestamped entry per build to
 * /tmp/observability/build-errors.log — either "build OK" or the compiler
 * output. The newest entry is the current state of the preview, so CI must
 * fail when it carries errors instead of shipping a red preview.
 *
 * A missing log means no build was observed (fresh CI runner): that is a pass,
 * unless --require-log is passed.
 *
 *   node scripts/check-build-errors.mjs
 *   node scripts/check-build-errors.mjs --file=/tmp/observability/build-errors.log
 */
import { existsSync, readFileSync } from "node:fs";

const args = process.argv.slice(2);
const fileArg = args.find((a) => a.startsWith("--file="))?.slice("--file=".length);
const LOG = fileArg ?? process.env.BUILD_ERRORS_LOG ?? "/tmp/observability/build-errors.log";
const REQUIRE_LOG = args.includes("--require-log");

if (!existsSync(LOG)) {
  if (REQUIRE_LOG) {
    console.error(`✖ Expected a build log at ${LOG} but none was written.`);
    process.exit(1);
  }
  console.log(`✓ No build-error log at ${LOG} — nothing to gate on.`);
  process.exit(0);
}

const raw = readFileSync(LOG, "utf8").trim();
if (!raw) {
  console.log("✓ Build-error log is empty.");
  process.exit(0);
}

/**
 * Entries are separated by a timestamp header. Only the last one describes the
 * build the pipeline just produced; older failures that were already fixed must
 * not keep the pipeline red.
 */
const entries = raw
  .split(/\n(?=\[?\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2})/)
  .map((e) => e.trim())
  .filter(Boolean);
const latest = entries[entries.length - 1] ?? raw;

const CLEAN = /\bbuild ok\b/i;
const ERROR = /\b(error|failed to (compile|build|resolve)|ts\d{4,}|Build failed)\b/i;

if (CLEAN.test(latest) && !ERROR.test(latest)) {
  console.log("✓ Latest build entry is clean.");
  process.exit(0);
}

if (!ERROR.test(latest)) {
  console.log("✓ Latest build entry reports no errors.");
  process.exit(0);
}

console.error("✖ Build errors were recorded for the most recent build:\n");
console.error(latest);
console.error(
  `\nFix the errors above, or inspect the full log at ${LOG}. ` +
    "A red build-errors entry means the preview is currently broken.",
);
process.exit(1);
