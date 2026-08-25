#!/usr/bin/env node
/**
 * Posts (and updates) a single CI test-summary comment on the pull request.
 *
 * Collects the results written by the Playwright-driven suites, renders a
 * markdown table, and links the run's artifacts: the HTML report, and — when
 * something failed — the traces/videos bundle. The comment is upserted via a
 * hidden marker so re-runs edit the existing comment instead of spamming.
 *
 * Also writes the same markdown to $GITHUB_STEP_SUMMARY when available.
 *
 * Env: GITHUB_TOKEN, GITHUB_REPOSITORY, GITHUB_RUN_ID, GITHUB_EVENT_PATH.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const MARKER = "<!-- gradr-ci-test-summary -->";
const REPORT_DIR = join(ROOT, "tests/reports");
const SUMMARY_SOURCES = [
  ["Route guards", "tests/reports/axe/route-guards-summary.json"],
  ["Refresh rotation", "tests/reports/json/refresh-rotation.json"],
  ["Multi-tab sign-out", "tests/reports/json/multi-tab-signout.json"],
];

// Theme pixel diffs are reported separately: they carry a drift % and a diff
// image per capture, and they can put the whole run in "quarantined" state.
const VISUAL_REPORT = "tests/reports/json/visual-themes.json";
// Optional public base (e.g. an S3/pages mirror of the diff dir). When set, the
// summary links the diff PNGs directly instead of pointing at the artifact zip.
const DIFF_BASE_URL = process.env.VISUAL_DIFF_BASE_URL?.replace(/\/$/, "");
const VISUAL_ARTIFACT = "theme-visual-diffs";


const repo = process.env.GITHUB_REPOSITORY;
const runId = process.env.GITHUB_RUN_ID;
const serverUrl = process.env.GITHUB_SERVER_URL ?? "https://github.com";
const runUrl = repo && runId ? `${serverUrl}/${repo}/actions/runs/${runId}` : null;

function loadResults() {
  const suites = [];
  for (const [name, rel] of SUMMARY_SOURCES) {
    const file = join(ROOT, rel);
    if (!existsSync(file)) continue;
    try {
      const parsed = JSON.parse(readFileSync(file, "utf8"));
      const results = Array.isArray(parsed) ? parsed : (parsed.results ?? []);
      suites.push({ name, results });
    } catch {
      /* malformed report — skip rather than fail the comment step */
    }
  }
  return suites;
}

/** Theme visual report, when the screenshot-diff step produced one. */
function loadVisual() {
  const file = join(ROOT, VISUAL_REPORT);
  if (!existsSync(file)) return null;
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    return { ...parsed, results: parsed.results ?? [] };
  } catch {
    return null;
  }
}

/** A link a reviewer can actually click through to the image itself. */
function diffLink(relPath) {
  if (!relPath) return null;
  if (DIFF_BASE_URL) return `${DIFF_BASE_URL}/${relPath.split("/").pop()}`;
  return runUrl ? `${runUrl}#artifacts` : null;
}

function visualSection(visual) {
  if (!visual) return [];
  const notable = visual.results.filter((r) => r.status !== "passed");
  const lines = [];

  if (visual.quarantined) {
    lines.push(
      "> [!WARNING]",
      `> **Visual run quarantined** — drift above the ${visual.quarantineThreshold}% quarantine threshold is treated as`,
      "> environment/renderer breakage rather than a pixel regression, so it does **not** block this merge.",
      "> All diff images are uploaded below; triage them and either fix the cause or approve new baselines.",
      "",
    );
  }

  lines.push(
    `**Theme visual diffs** — fail above ${visual.tolerance}% drift, quarantine above ${visual.quarantineThreshold}%`,
    "",
  );

  if (!notable.length) {
    lines.push(`✅ All ${visual.results.length} theme captures within ${visual.tolerance}% drift.`, "");
    return lines;
  }

  lines.push("| | Capture | Drift | Diff image |", "| --- | --- | --- | --- |");
  for (const r of notable) {
    const icon = r.status === "quarantined" ? "🟡" : "❌";
    const drift = r.drift === undefined ? (r.detail ?? "—") : `${r.drift}%`;
    const link = diffLink(r.diff);
    const cell = link
      ? `[\`${r.diff.split("/").pop()}\`](${link})`
      : r.diff
        ? `\`${r.diff}\``
        : r.sizeChanged
          ? "capture size changed"
          : "—";
    lines.push(`| ${icon} | \`${r.name}\` | ${drift} | ${cell} |`);
  }
  if (!DIFF_BASE_URL && runUrl) {
    lines.push(
      "",
      `<sub>Diff images ship in the [\`${VISUAL_ARTIFACT}\` artifact](${runUrl}#artifacts) — download it and open the file named in each row (baseline and current captures are in the same bundle).</sub>`,
    );
  }
  lines.push("");
  return lines;
}

function artifactLines(visual) {
  const lines = [];
  const htmlDir = join(REPORT_DIR, "html");
  const reports = existsSync(htmlDir) ? readdirSync(htmlDir).filter((f) => f.endsWith(".html")) : [];
  if (runUrl) {
    lines.push(
      reports.length
        ? `- **HTML report** (${reports.join(", ")}): [\`playwright-html-report\` artifact](${runUrl}#artifacts)`
        : `- **HTML report**: not produced by this run`,
    );
  }
  const hasTraces = existsSync(join(REPORT_DIR, "traces")) || existsSync(join(REPORT_DIR, "videos"));
  if (runUrl) {
    lines.push(
      hasTraces
        ? `- **Failing traces & videos**: [\`playwright-traces-and-videos\` artifact](${runUrl}#artifacts) — open a \`.zip\` trace at [trace.playwright.dev](https://trace.playwright.dev)`
        : `- **Failing traces & videos**: none captured (nothing failed in a traced context)`,
    );
    lines.push(`- **Accessibility JSON**: [\`route-guard-axe-reports\` artifact](${runUrl}#artifacts)`);
    lines.push(`- **Route visual diffs**: [\`route-guard-visuals\` artifact](${runUrl}#artifacts)`);
    lines.push(
      visual
        ? `- **Theme baseline/current/diff images**: [\`${VISUAL_ARTIFACT}\` artifact](${runUrl}#artifacts)`
        : `- **Theme baseline diffs**: not produced by this run`,
    );
    lines.push(`- **Full logs**: [workflow run](${runUrl})`);
  }
  return lines;
}

function render(suites, visual) {
  const rows = [];
  let totalFailed = 0;
  for (const suite of suites) {
    const ran = suite.results.filter((r) => !r.skipped);
    const failed = ran.filter((r) => !r.ok);
    totalFailed += failed.length;
    rows.push(
      `| ${failed.length ? "❌" : "✅"} | **${suite.name}** | ${ran.length - failed.length} passed · ${failed.length} failed · ${suite.results.length - ran.length} skipped |`,
    );
    for (const f of failed.slice(0, 8)) {
      rows.push(`| | ↳ \`${f.name}\` | ${String(f.detail ?? "").slice(0, 160) || "failed"} |`);
    }
  }
  if (visual) {
    const failed = visual.results.filter((r) => r.status === "failed").length;
    const quar = visual.results.filter((r) => r.status === "quarantined").length;
    totalFailed += failed;
    rows.push(
      `| ${failed ? "❌" : quar ? "🟡" : "✅"} | **Theme visuals** | ${
        visual.results.length - failed - quar
      } passed · ${failed} failed · ${quar} quarantined |`,
    );
  }
  if (!rows.length) rows.push("| ℹ️ | No suite reports found | the test steps skipped or did not run |");

  const heading = totalFailed ? "❌" : visual?.quarantined ? "🟡" : "✅";
  const title = totalFailed
    ? "CI test summary"
    : visual?.quarantined
      ? "CI test summary — visual drift quarantined (not blocking)"
      : "CI test summary";

  return [
    MARKER,
    `### ${heading} ${title}`,
    "",
    "| | Suite | Result |",
    "| --- | --- | --- |",
    ...rows,
    "",
    ...visualSection(visual),
    "**Artifacts**",
    ...artifactLines(visual),
    "",
    `<sub>Updated ${new Date().toISOString()}${runId ? ` · run \`${runId}\`` : ""}</sub>`,
  ].join("\n");
}


async function upsertComment(body) {
  const token = process.env.GITHUB_TOKEN;
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!token || !repo || !eventPath || !existsSync(eventPath)) {
    console.log("No PR context (token/event missing) — summary written to stdout only.");
    return;
  }
  const event = JSON.parse(readFileSync(eventPath, "utf8"));
  const prNumber = event.pull_request?.number;
  if (!prNumber) {
    console.log("Not a pull_request event — skipping comment.");
    return;
  }
  const api = `https://api.github.com/repos/${repo}`;
  const headers = {
    authorization: `Bearer ${token}`,
    accept: "application/vnd.github+json",
    "content-type": "application/json",
  };

  const listed = await fetch(`${api}/issues/${prNumber}/comments?per_page=100`, { headers });
  const comments = listed.ok ? await listed.json() : [];
  const existing = comments.find((c) => typeof c.body === "string" && c.body.includes(MARKER));

  const res = existing
    ? await fetch(`${api}/issues/comments/${existing.id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ body }),
      })
    : await fetch(`${api}/issues/${prNumber}/comments`, {
        method: "POST",
        headers,
        body: JSON.stringify({ body }),
      });

  console.log(
    res.ok
      ? `${existing ? "Updated" : "Posted"} CI summary comment on PR #${prNumber}.`
      : `Failed to post comment: HTTP ${res.status} ${await res.text()}`,
  );
}

mkdirSync(REPORT_DIR, { recursive: true });
const body = render(loadResults(), loadVisual());
console.log(body);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, body + "\n");
writeFileSync(join(REPORT_DIR, "ci-summary.md"), body + "\n");
await upsertComment(body);
