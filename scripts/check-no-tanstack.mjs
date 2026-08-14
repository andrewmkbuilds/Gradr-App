#!/usr/bin/env node
/**
 * Guardrail: Gradr must stay on the Vite + React Router architecture.
 * Fails the build if TanStack Start (or related router/start packages) is
 * added to dependencies, lockfiles, config, or source imports.
 */
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const errors = [];

const FORBIDDEN_PKG = /^@tanstack\/(start|react-start|react-router|router|start-.*)/;
const FORBIDDEN_IMPORT = /@tanstack\/(start|react-start|react-router|router|start-[a-z-]+)/;

// 1. package.json dependencies
const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
for (const field of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
  for (const name of Object.keys(pkg[field] ?? {})) {
    if (FORBIDDEN_PKG.test(name)) {
      errors.push(`package.json ${field} contains forbidden package "${name}"`);
    }
  }
}

// 2. Forbidden framework entry files from an aborted migration
for (const file of ["src/start.ts", "src/start.tsx", "app.config.ts", "src/router.tsx", "src/routeTree.gen.ts"]) {
  if (existsSync(join(ROOT, file))) {
    errors.push(`TanStack Start artifact present: ${file}`);
  }
}

// 3. Source imports
const SCAN_DIRS = ["src", "scripts", "supabase/functions"];
const EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json"]);
const SELF = relative(ROOT, new URL(import.meta.url).pathname);

function walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      walk(full);
      continue;
    }
    const ext = entry.slice(entry.lastIndexOf("."));
    if (!EXTS.has(ext)) continue;
    const rel = relative(ROOT, full);
    if (rel === SELF) continue;
    const src = readFileSync(full, "utf8");
    src.split("\n").forEach((line, i) => {
      if (FORBIDDEN_IMPORT.test(line)) {
        errors.push(`${rel}:${i + 1} references TanStack Start/Router: ${line.trim().slice(0, 120)}`);
      }
    });
  }
}
SCAN_DIRS.forEach((d) => walk(join(ROOT, d)));

// 4. Lockfiles — catches direct AND transitive installs, whichever package
//    manager produced them. yarn.lock and package-lock.json record the whole
//    resolved tree, so a dependency pulling TanStack Start in fails here.
const FORBIDDEN_NAMES = [
  "@tanstack/start",
  "@tanstack/react-start",
  "@tanstack/react-router",
  "@tanstack/router",
  "@tanstack/start-client",
  "@tanstack/start-server",
  "@tanstack/router-plugin",
  "@tanstack/router-devtools",
];

for (const lock of ["bun.lockb", "bun.lock", "package-lock.json", "yarn.lock", "pnpm-lock.yaml", "npm-shrinkwrap.json"]) {
  const path = join(ROOT, lock);
  if (!existsSync(path)) continue;
  const content = readFileSync(path, "latin1");
  for (const name of FORBIDDEN_NAMES) {
    if (content.includes(name)) {
      errors.push(`${lock} contains "${name}" (direct or transitive) — remove the dependency and reinstall`);
    }
  }
}

// 5. Installed tree — a lockfile can lag behind what is actually on disk.
for (const name of FORBIDDEN_NAMES) {
  if (existsSync(join(ROOT, "node_modules", ...name.split("/")))) {
    errors.push(`node_modules contains "${name}" — it is installed even if no lockfile mentions it`);
  }
}

// 6. Generated build artifacts — a stale or freshly built bundle that still
//    ships TanStack Start code must fail CI just like source would.
const ARTIFACT_DIRS = ["dist", "build", ".output", ".vercel/output", "public/build"];
const ARTIFACT_EXTS = new Set([".js", ".mjs", ".cjs", ".css", ".html", ".json", ".map", ".txt"]);

function walkArtifacts(dir, rootLabel) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      walkArtifacts(full, rootLabel);
      continue;
    }
    const ext = entry.slice(entry.lastIndexOf("."));
    if (!ARTIFACT_EXTS.has(ext)) continue;
    // Bundles are large; a substring scan is enough and stays fast.
    const content = readFileSync(full, "latin1");
    for (const name of FORBIDDEN_NAMES) {
      if (content.includes(name)) {
        errors.push(`build artifact ${relative(ROOT, full)} references "${name}" — rebuild after removing it`);
        break;
      }
    }
  }
}

for (const dir of ARTIFACT_DIRS) {
  const full = join(ROOT, dir);
  if (existsSync(full)) walkArtifacts(full, dir);
}


if (errors.length) {
  console.error("TanStack Start guardrail FAILED. Gradr must stay on Vite + React Router.\n");
  for (const e of errors) console.error(`  - ${e}`);
  console.error(`\n${errors.length} violation(s).`);
  process.exit(1);
}

console.log("TanStack Start guardrail passed: no forbidden packages, artifacts, or imports.");
