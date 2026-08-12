#!/usr/bin/env node
/**
 * Automated legal-link consistency check.
 *
 * Asserts that every legal destination the product exposes — footer links,
 * in-app modals/banners, and transactional email templates — resolves to the
 * canonical gradr.me domain, and that no page still points at a legacy
 * (*.lovable.app / careerflowos) host.
 *
 * Usage: node scripts/check-legal-links.mjs
 * Exit 0 = consistent, 1 = at least one mismatch.
 */
import { readFileSync, readdirSync, statSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join, relative } from "path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");

export const CANONICAL_ORIGIN = "https://gradr.me";
/** Hosts that must never appear in a legal link. */
const LEGACY_HOST = /(careerflowos|gradr-app|id-preview[\w-]*)\.lovable\.app/i;
/** Every legal route the app ships. Mirrors LEGAL_PAGES in src/content/legal.ts. */
export const LEGAL_PATHS = ["/terms", "/privacy", "/cookie-policy", "/dpa", "/refund-policy"];

const SCAN_DIRS = ["src", "supabase/functions", "public"];
const SCAN_FILES = ["index.html"];
const EXT = /\.(tsx?|jsx?|mjs|html|txt|json)$/;
const SKIP_DIR = /node_modules|\.git|dist/;

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(join(ROOT, dir));
  } catch {
    return out;
  }
  for (const name of entries) {
    const rel = join(dir, name);
    if (SKIP_DIR.test(rel)) continue;
    const st = statSync(join(ROOT, rel));
    if (st.isDirectory()) walk(rel, out);
    else if (EXT.test(name)) out.push(rel);
  }
  return out;
}

function sourceFiles() {
  const files = SCAN_DIRS.flatMap((d) => walk(d));
  for (const f of SCAN_FILES) {
    try {
      statSync(join(ROOT, f));
      files.push(f);
    } catch {
      /* optional */
    }
  }
  return files.map((f) => relative(".", f));
}

/**
 * Returns a list of problems. Each problem is
 * `{ file, line, snippet, reason }`.
 */
export function findLegalLinkProblems() {
  const problems = [];
  const legalPathAlt = LEGAL_PATHS.map((p) => p.replace("/", "\\/")).join("|");
  // Absolute URL that ends in a legal path, on any host.
  const absoluteLegal = new RegExp(`https?:\\/\\/[^\\s"'\`)]*(${legalPathAlt})\\b`, "gi");

  for (const file of sourceFiles()) {
    const src = read(file);
    const lines = src.split("\n");
    lines.forEach((line, i) => {
      for (const match of line.matchAll(absoluteLegal)) {
        const url = match[0];
        if (LEGACY_HOST.test(url)) {
          problems.push({
            file,
            line: i + 1,
            snippet: url,
            reason: `legal link points at a legacy host; use ${CANONICAL_ORIGIN}`,
          });
        } else if (!url.startsWith(CANONICAL_ORIGIN)) {
          problems.push({
            file,
            line: i + 1,
            snippet: url,
            reason: `legal link is absolute but not on ${CANONICAL_ORIGIN}`,
          });
        }
      }
      // Email templates build links from an APP_URL base — that base must be canonical.
      const base = line.match(/APP_PUBLIC_URL"\)\s*\|\|\s*"([^"]+)"/);
      if (base && base[1].replace(/\/$/, "") !== CANONICAL_ORIGIN) {
        problems.push({
          file,
          line: i + 1,
          snippet: base[1],
          reason: `email template base URL must default to ${CANONICAL_ORIGIN}`,
        });
      }
    });
  }
  return problems;
}

/** Every legal route must be linked from the shared public footer. */
export function findMissingFooterLinks() {
  const legalSrc = read("src/content/legal.ts");
  const declared = [...legalSrc.matchAll(/path:\s*"(\/[a-z-]+)"/g)].map((m) => m[1]);
  const missingFromRegistry = LEGAL_PATHS.filter((p) => !declared.includes(p));
  const app = read("src/App.tsx");
  const missingRoutes = LEGAL_PATHS.filter((p) => !app.includes(`path="${p}"`));
  return { missingFromRegistry, missingRoutes };
}

export function runLegalLinkCheck() {
  const problems = findLegalLinkProblems();
  const { missingFromRegistry, missingRoutes } = findMissingFooterLinks();
  return { problems, missingFromRegistry, missingRoutes };
}

const isMain = process.argv[1] && process.argv[1].endsWith("check-legal-links.mjs");
if (isMain) {
  const { problems, missingFromRegistry, missingRoutes } = runLegalLinkCheck();
  for (const p of problems) {
    console.log(`FAIL ${p.file}:${p.line}  ${p.snippet}\n     ${p.reason}`);
  }
  for (const p of missingFromRegistry) {
    console.log(`FAIL ${p} is not listed in LEGAL_PAGES (src/content/legal.ts) — footer will omit it`);
  }
  for (const p of missingRoutes) {
    console.log(`FAIL ${p} has no route in src/App.tsx`);
  }
  const total = problems.length + missingFromRegistry.length + missingRoutes.length;
  if (total === 0) {
    console.log(`PASS all legal links resolve to ${CANONICAL_ORIGIN} and every policy route is wired.`);
  }
  console.log(total === 0 ? "\nLegal links: consistent." : `\n${total} legal link problem(s).`);
  process.exit(total === 0 ? 0 : 1);
}
