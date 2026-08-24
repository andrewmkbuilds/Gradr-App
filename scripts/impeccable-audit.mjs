#!/usr/bin/env node
/**
 * Impeccable audit runner.
 *
 * Composes the Impeccable anti-pattern detector with the project's own
 * deterministic design checks into one severity-ranked issue list, and writes
 * a JSON + HTML report to tests/reports/impeccable/ so reviewers can open the
 * result straight from the repo or from a CI artifact.
 *
 * Severity model (mirrors the Impeccable audit reference):
 *   P0 blocking  — the check crashed or a hard gate failed
 *   P1 major     — detector "error" findings, WCAG A/AA violations
 *   P2 minor     — detector "warning" findings
 *   P3 polish    — advisory findings
 *
 * Usage:
 *   node scripts/impeccable-audit.mjs             # report only
 *   node scripts/impeccable-audit.mjs --strict    # exit 1 on any P0/P1
 *   node scripts/impeccable-audit.mjs --a11y http://127.0.0.1:8080
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "tests/reports/impeccable");
const SKILL = join(ROOT, ".agents/skills/impeccable/scripts/detect.mjs");

const args = process.argv.slice(2);
const STRICT = args.includes("--strict");
const a11yIndex = args.indexOf("--a11y");
const A11Y_BASE = a11yIndex >= 0 ? (args[a11yIndex + 1] ?? "http://127.0.0.1:8080") : null;

/** Detector severity -> audit severity. */
const SEVERITY = { error: "P1", warning: "P2", advisory: "P3" };

const issues = [];
const checks = [];

function record(check, { ok, detail = "", severity = "P1" }) {
  checks.push({ check, ok, detail });
  if (!ok) issues.push({ severity, category: "Gate", title: check, location: "-", detail });
}

function run(cmd, cmdArgs) {
  try {
    return { code: 0, out: execFileSync(cmd, cmdArgs, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }) };
  } catch (error) {
    return { code: error.status ?? 1, out: `${error.stdout ?? ""}${error.stderr ?? ""}` };
  }
}

/**
 * A finding is waived when the flagged line, or anywhere in its enclosing block, carries an `impeccable-allow: <rule>` comment. The comment must state a
 * reason so waivers stay reviewable in the diff.
 */
const fileCache = new Map();
function isWaived(f) {
  if (!existsSync(f.file)) return false;
  if (!fileCache.has(f.file)) fileCache.set(f.file, readFileSync(f.file, "utf8").split("\n"));
  const lines = fileCache.get(f.file);
  // Walk up from the flagged line to the start of its block (a blank line or a
  // closing brace), so one comment can cover a whole rule or JSX element.
  const window = [];
  for (let i = f.line - 1; i >= 0 && f.line - i <= 40; i -= 1) {
    const line = lines[i] ?? "";
    window.push(line);
    if (window.length > 1 && (line.trim() === "" || line.trim().endsWith("}"))) break;
  }
  return new RegExp(`impeccable-allow:\\s*(${f.antipattern}|all)\\b`).test(window.join("\n"));
}

// 1. Impeccable anti-pattern detector -----------------------------------------
if (existsSync(SKILL)) {
  const { out } = run("node", [SKILL, "--json", "src"]);
  let findings = [];
  try {
    findings = JSON.parse(out);
  } catch {
    record("Impeccable detector", { ok: false, detail: "detector produced no parseable JSON", severity: "P0" });
  }
  const waived = [];
  for (const f of findings) {
    if (isWaived(f)) {
      waived.push(`${relative(ROOT, f.file)}:${f.line} ${f.antipattern}`);
      continue;
    }
    issues.push({
      severity: SEVERITY[f.severity] ?? "P2",
      category: f.category === "slop" ? "Implementation integrity" : (f.category ?? "Implementation integrity"),
      title: f.name ?? f.antipattern,
      rule: f.antipattern,
      location: `${relative(ROOT, f.file)}:${f.line}`,
      detail: f.description ?? "",
      evidence: f.match ?? "",
      recommendation: f.suggestion ?? "",
    });
  }
  record("Impeccable detector", {
    ok: true,
    detail: `${findings.length} finding(s), ${waived.length} waived by \`impeccable-allow\` comment`,
  });
} else {
  record("Impeccable detector", { ok: false, detail: "skill scripts not installed", severity: "P0" });
}

// 2. Theming: every design-token utility must compile --------------------------
{
  const { code, out } = run("node", [join(ROOT, "scripts/check-tailwind-classes.mjs")]);
  record("Design tokens compile", { ok: code === 0, detail: out.trim().split("\n").pop() ?? "" });
}

// 3. Theming: no legacy design-system remnants ---------------------------------
{
  const { code, out } = run("node", [join(ROOT, "scripts/check-legacy-design.mjs")]);
  record("No legacy design remnants", { ok: code === 0, detail: out.trim().split("\n").pop() ?? "" });
}

// 4. Theming: hardcoded-colour lint --------------------------------------------
{
  const { out } = run("npx", ["eslint", "--config", "eslint.design.config.js", ".", "-f", "json"]);
  let problems = 0;
  try {
    for (const file of JSON.parse(out.slice(out.indexOf("["))) ) {
      for (const m of file.messages) {
        problems += 1;
        issues.push({
          severity: m.severity === 2 ? "P1" : "P2",
          category: "Theming",
          title: m.ruleId ?? "design lint",
          location: `${relative(ROOT, file.filePath)}:${m.line}`,
          detail: m.message,
        });
      }
    }
    record("Design-token lint", { ok: problems === 0, detail: `${problems} problem(s)` });
  } catch {
    record("Design-token lint", { ok: false, detail: "eslint produced no parseable JSON", severity: "P0" });
  }
}

// 5. Accessibility: axe across public routes, both themes, both widths ---------
if (A11Y_BASE) {
  const { code, out } = run("node", [join(ROOT, "scripts/a11y-audit.mjs"), A11Y_BASE]);
  if (code !== 0) {
    for (const line of out.split("\n").filter((l) => /\[(critical|serious|moderate|minor)\]/i.test(l))) {
      const impact = (line.match(/\[(\w+)\]/) ?? [])[1]?.toLowerCase();
      issues.push({
        severity: impact === "critical" || impact === "serious" ? "P1" : "P2",
        category: "Accessibility",
        title: line.trim(),
        location: "public routes",
        detail: "WCAG 2.1 A/AA violation reported by axe-core",
      });
    }
  }
  record("Accessibility (axe, light+dark, mobile+desktop)", { ok: code === 0, detail: code === 0 ? "no WCAG A/AA violations" : "violations found" });
} else {
  checks.push({ check: "Accessibility (axe)", ok: null, detail: "skipped — pass --a11y <base-url>" });
}

// Report ----------------------------------------------------------------------
const order = ["P0", "P1", "P2", "P3"];
issues.sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity) || a.location.localeCompare(b.location));
const counts = Object.fromEntries(order.map((s) => [s, issues.filter((i) => i.severity === s).length]));
const blocking = counts.P0 + counts.P1;

const report = {
  generatedAt: new Date().toISOString(),
  strict: STRICT,
  counts,
  blocking,
  checks,
  issues,
};

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, "report.json"), `${JSON.stringify(report, null, 2)}\n`);

const esc = (v) => String(v ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
const tone = { P0: "#8c2f2f", P1: "#a4531f", P2: "#256074", P3: "#55676d" };
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Impeccable audit — Gradr</title>
<style>
  :root { color-scheme: light; }
  body { margin:0; padding:2.5rem 1.5rem; background:#f9f7f6; color:#18292f;
         font:16px/1.6 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif; }
  main { max-width:60rem; margin:0 auto; }
  h1 { font-size:1.9rem; letter-spacing:-.02em; margin:0 0 .25rem; }
  p.meta { color:#55676d; margin:0 0 2rem; }
  .cards { display:flex; flex-wrap:wrap; gap:.75rem; margin-bottom:2rem; }
  .card { flex:1 1 8rem; background:#fff; border:1px solid #e3dedb; border-radius:1rem; padding:1rem 1.1rem; }
  .card b { display:block; font-size:1.6rem; }
  table { width:100%; border-collapse:collapse; background:#fff; border:1px solid #e3dedb; border-radius:1rem; overflow:hidden; }
  th,td { text-align:left; padding:.7rem .9rem; border-bottom:1px solid #efeae7; vertical-align:top; font-size:.9rem; }
  th { background:#f3efec; font-weight:600; }
  tr:last-child td { border-bottom:0; }
  code { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:.82rem; }
  .sev { font-weight:700; }
  h2 { font-size:1.15rem; margin:2.5rem 0 .75rem; }
  .ok { color:#2f6b46; } .bad { color:#8c2f2f; } .skip { color:#55676d; }
</style></head>
<body><main>
<h1>Impeccable audit</h1>
<p class="meta">Gradr · generated ${esc(report.generatedAt)} · ${blocking} blocking issue(s)</p>
<div class="cards">
${order.map((s) => `<div class="card"><b style="color:${tone[s]}">${counts[s]}</b>${s}</div>`).join("")}
</div>
<h2>Checks</h2>
<table><tr><th>Check</th><th>Result</th><th>Detail</th></tr>
${checks.map((c) => `<tr><td>${esc(c.check)}</td><td class="${c.ok === null ? "skip" : c.ok ? "ok" : "bad"}">${c.ok === null ? "skipped" : c.ok ? "pass" : "fail"}</td><td>${esc(c.detail)}</td></tr>`).join("")}
</table>
<h2>Issues</h2>
${issues.length === 0 ? "<p>No issues recorded.</p>" : `<table><tr><th>Sev</th><th>Category</th><th>Issue</th><th>Location</th></tr>
${issues.map((i) => `<tr><td class="sev" style="color:${tone[i.severity]}">${i.severity}</td><td>${esc(i.category)}</td><td><strong>${esc(i.title)}</strong><br>${esc(i.detail)}${i.evidence ? `<br><code>${esc(i.evidence)}</code>` : ""}</td><td><code>${esc(i.location)}</code></td></tr>`).join("")}
</table>`}
</main></body></html>
`;
writeFileSync(join(OUT_DIR, "report.html"), html);

console.log(`Impeccable audit — P0:${counts.P0} P1:${counts.P1} P2:${counts.P2} P3:${counts.P3}`);
for (const c of checks) {
  console.log(`  ${c.ok === null ? "○" : c.ok ? "✓" : "✗"} ${c.check}${c.detail ? ` — ${c.detail}` : ""}`);
}
for (const i of issues) console.log(`  [${i.severity}] ${i.category}: ${i.title} (${i.location})`);
console.log(`\nReport: ${relative(ROOT, join(OUT_DIR, "report.html"))} and report.json`);

if (STRICT && blocking > 0) {
  console.error(`\n✗ ${blocking} blocking (P0/P1) issue(s) — failing the build.`);
  process.exit(1);
}
if (existsSync(join(OUT_DIR, "report.json")) === false) process.exit(1);
