#!/usr/bin/env node
/**
 * CI wrapper: serve the production build and run the headless-browser smoke
 * suite against it, failing the build on runtime errors or blank screens.
 *
 * Usage: node scripts/smoke-ci.mjs            (expects dist/ to exist)
 *        SMOKE_BASE_URL=https://gradr.me node scripts/smoke-ci.mjs   (remote)
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

const REMOTE = process.env.SMOKE_BASE_URL;
const PORT = Number(process.env.SMOKE_PORT ?? 4173);
const BASE = REMOTE ?? `http://localhost:${PORT}`;

function run(cmd, args, opts = {}) {
  return spawn(cmd, args, { stdio: "inherit", ...opts });
}

async function waitForServer(url, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

let server = null;
try {
  if (!REMOTE) {
    if (!existsSync(new URL("../dist/index.html", import.meta.url))) {
      console.error("dist/ not found — run the production build before the smoke suite.");
      process.exit(1);
    }
    console.log(`Starting preview server on :${PORT}…`);
    server = run("npx", ["vite", "preview", "--port", String(PORT), "--strictPort"], { stdio: "ignore" });
    if (!(await waitForServer(BASE))) {
      console.error(`Preview server never became ready at ${BASE}`);
      process.exit(1);
    }
  }

  const code = await new Promise((resolve) => {
    const child = run(process.execPath, ["scripts/smoke-test.mjs", BASE]);
    child.on("exit", (c) => resolve(c ?? 1));
  });
  process.exitCode = code;
} finally {
  server?.kill("SIGTERM");
}
