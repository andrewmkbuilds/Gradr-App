/**
 * Scheduled security scan.
 *
 * Invoked on a fixed cadence by pg_cron. Requires the shared CRON_SECRET (or a
 * service-role bearer token), runs a fresh scan, diffs it against the previous
 * run and posts the delta summary to Slack.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { adminClient, latestDiff, runScan } from "../_shared/securityScan.ts";
import { logSecurityEvent } from "../_shared/securityAudit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function authorised(req: Request, body: Record<string, unknown>): boolean {
  const expected = [Deno.env.get("SECURITY_CRON_SECRET"), Deno.env.get("CRON_SECRET")].filter(
    (v): v is string => Boolean(v),
  );
  if (!expected.length) return false;
  const header = req.headers.get("x-cron-secret") ?? "";
  const bearer = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  return expected.some((s) => header === s || bearer === s || body.cron_secret === s);
}

const APP_URL = "https://gradr.me/admin/security-findings";

async function postToSlack(text: string, blocks: unknown[]) {
  const webhook = Deno.env.get("ALERT_SLACK_WEBHOOK_URL");
  if (!webhook) {
    console.warn("[security-scan-cron] ALERT_SLACK_WEBHOOK_URL not configured; skipping Slack post");
    return { posted: false, reason: "webhook_not_configured" };
  }
  const res = await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, blocks }),
  });
  if (!res.ok) {
    const detail = await res.text();
    console.error(`[security-scan-cron] Slack post failed [${res.status}]: ${detail}`);
    return { posted: false, status: res.status, detail };
  }
  return { posted: true };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
  if (!authorised(req, body as Record<string, unknown>)) {
    return json({ error: "Unauthorized" }, 401);
  }

  try {
    const db = adminClient();
    const { run } = await runScan(db, { trigger: "scheduled", commit: body.commit ?? {} });
    const diff = await latestDiff(db);

    const newOnes = diff.entries.filter((e) => e.status === "new");
    const resolved = diff.entries.filter((e) => e.status === "resolved");
    const changed = diff.entries.filter((e) => e.status === "changed");

    const list = (items: typeof newOnes, limit = 8) =>
      items
        .slice(0, limit)
        .map((e) => `• \`${e.internal_id}\` — ${(e.current ?? e.previous)?.title ?? ""}`)
        .join("\n") + (items.length > limit ? `\n• …and ${items.length - limit} more` : "");

    const headline =
      newOnes.length > 0
        ? `:rotating_light: ${newOnes.length} new security finding${newOnes.length === 1 ? "" : "s"}`
        : `:white_check_mark: No new security findings`;

    const sections: unknown[] = [
      { type: "header", text: { type: "plain_text", text: "Gradr security scan" } },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `${headline}\n*New:* ${diff.counts.new}  *Resolved:* ${diff.counts.resolved}  *Changed:* ${diff.counts.changed}  *Unchanged:* ${diff.counts.unchanged}`,
        },
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `Run \`${run.id.slice(0, 8)}\` · totals ${JSON.stringify(run.totals)}${run.commit_sha ? ` · commit \`${run.commit_sha.slice(0, 8)}\`` : ""}`,
          },
        ],
      },
    ];
    if (newOnes.length) {
      sections.push({ type: "section", text: { type: "mrkdwn", text: `*New*\n${list(newOnes)}` } });
    }
    if (resolved.length) {
      sections.push({ type: "section", text: { type: "mrkdwn", text: `*Resolved*\n${list(resolved)}` } });
    }
    if (changed.length) {
      sections.push({ type: "section", text: { type: "mrkdwn", text: `*Changed*\n${list(changed)}` } });
    }
    sections.push({
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "Open security findings" },
          url: APP_URL,
        },
      ],
    });

    const slack = await postToSlack(
      `${headline} — new ${diff.counts.new}, resolved ${diff.counts.resolved}, changed ${diff.counts.changed}`,
      sections,
    );

    await logSecurityEvent({
      category: "entitlement_check",
      event: "security_scan_scheduled",
      decision: "processed",
      source: "security-scan-cron",
      details: { run_id: run.id, counts: diff.counts, slack },
    });

    return json({ ok: true, run_id: run.id, counts: diff.counts, slack });
  } catch (e) {
    console.error("[security-scan-cron]", e);
    return json({ error: e instanceof Error ? e.message : "Scan failed" }, 500);
  }
});
