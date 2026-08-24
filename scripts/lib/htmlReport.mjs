/**
 * Standalone HTML report for the Playwright-driven suites.
 *
 * The route guard / visual suites are plain Playwright scripts rather than
 * @playwright/test runs, so there is no built-in HTML reporter. This writes an
 * equivalent single-file report (no assets to serve, opens straight from a CI
 * artifact download) listing every check, its detail, retries and any attached
 * screenshots, diffs, traces or videos.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const escape = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/**
 * @param {object} options
 * @param {string} options.outFile          absolute path of the HTML file
 * @param {string} options.title            report heading
 * @param {string} options.baseUrl          target the suite ran against
 * @param {Array}  options.results          [{ name, ok, detail, attempts, skipped }]
 * @param {Array}  [options.attachments]    [{ label, path, kind }]
 */
export function writeHtmlReport({ outFile, title, baseUrl, results, attachments = [] }) {
  const passed = results.filter((r) => r.ok && !r.skipped).length;
  const failed = results.filter((r) => !r.ok && !r.skipped);
  const skipped = results.filter((r) => r.skipped);
  const status = failed.length ? "failed" : "passed";

  const rows = results
    .map((r) => {
      const state = r.skipped ? "skip" : r.ok ? "pass" : "fail";
      const label = r.skipped ? "SKIP" : r.ok ? "PASS" : "FAIL";
      const retries = r.attempts && r.attempts > 1 ? `<span class="retry">${r.attempts} attempts</span>` : "";
      return `<tr class="${state}"><td class="tag">${label}</td><td>${escape(r.name)} ${retries}</td><td class="detail">${escape(r.detail)}</td></tr>`;
    })
    .join("\n");

  const attachmentList = attachments.length
    ? attachments
        .map((a) => `<li><span class="kind">${escape(a.kind ?? "file")}</span> <code>${escape(a.path)}</code> — ${escape(a.label ?? "")}</li>`)
        .join("\n")
    : '<li class="muted">No attachments captured.</li>';

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escape(title)}</title>
<style>
:root{color-scheme:light dark;--bg:#f9f7f6;--fg:#1b2225;--muted:#55676d;--line:#dcd9d7;--pass:#256074;--fail:#8c2f26;--skip:#7a7370;--card:#fff}
@media (prefers-color-scheme:dark){:root{--bg:#131a1d;--fg:#eef2f3;--muted:#a9b8bd;--line:#2b3639;--card:#1a2225}}
*{box-sizing:border-box}
body{margin:0;padding:32px;background:var(--bg);color:var(--fg);font:15px/1.5 ui-sans-serif,system-ui,-apple-system,Segoe UI,sans-serif}
h1{font-size:22px;margin:0 0 4px}
.meta{color:var(--muted);font-size:13px;margin-bottom:24px}
.summary{display:flex;gap:12px;margin-bottom:24px;flex-wrap:wrap}
.chip{border:1px solid var(--line);background:var(--card);border-radius:11px;padding:10px 16px;min-width:110px}
.chip b{display:block;font-size:20px}
table{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--line);border-radius:11px;overflow:hidden}
td{padding:9px 12px;border-top:1px solid var(--line);vertical-align:top}
tr:first-child td{border-top:0}
.tag{font:600 11px/1.6 ui-monospace,monospace;width:56px;letter-spacing:.06em}
tr.pass .tag{color:var(--pass)}tr.fail .tag{color:var(--fail)}tr.skip .tag{color:var(--skip)}
tr.fail{background:color-mix(in srgb,var(--fail) 8%,transparent)}
.detail{color:var(--muted);font-size:13px;max-width:38%}
.retry{color:var(--muted);font-size:12px}
h2{font-size:15px;margin:28px 0 8px}
ul{margin:0;padding-left:18px;color:var(--muted);font-size:13px}
.kind{display:inline-block;min-width:78px;color:var(--fg);font:600 11px/1.6 ui-monospace,monospace}
code{font-size:12px}
.muted{color:var(--muted)}
.status-failed{color:var(--fail)}.status-passed{color:var(--pass)}
</style></head>
<body>
<h1>${escape(title)} — <span class="status-${status}">${status}</span></h1>
<div class="meta">${escape(baseUrl)} · ${new Date().toISOString()}</div>
<div class="summary">
  <div class="chip"><b>${passed}</b>passed</div>
  <div class="chip"><b>${failed.length}</b>failed</div>
  <div class="chip"><b>${skipped.length}</b>skipped</div>
</div>
<table>${rows}</table>
<h2>Attachments</h2>
<ul>${attachmentList}</ul>
</body></html>`;

  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, html);
  return outFile;
}
