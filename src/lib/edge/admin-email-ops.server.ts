/**
 * Admin email operations endpoint.
 *
 * One admin-gated surface for everything the transactional email system needs
 * a human for:
 *
 *  - `metrics`  : deduplicated delivery counts (queued/sent/failed/suppressed)
 *                 plus engagement events (opened/clicked/bounced/complained),
 *                 filtered by date range and template ("campaign").
 *  - `log`      : the deduplicated per-email table behind those numbers.
 *  - `dlq`      : messages that exhausted retries and will never send on their
 *                 own, with the last error attached.
 *  - `replay`   : re-render and re-enqueue a dead-lettered message. Idempotency
 *                 is enforced through `email_idempotency`, so a double click
 *                 (or a second admin) cannot produce a duplicate send.
 *  - `preview`  : render any registered template with its sample data and
 *                 return BOTH the HTML and the plain-text alternative.
 *
 * Every action verifies a non-anonymous JWT with the `admin` role server-side.
 */
import { corsHeaders } from "./shared/cors";
import { createClient } from "./shared/supabase";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

interface LogRow {
  message_id: string;
  template_name: string;
  recipient_email: string;
  status: string;
  error_message: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

/** Latest row per message_id — one email is many rows (pending → sent/dlq). */
function dedupe(rows: LogRow[]): LogRow[] {
  const latest = new Map<string, LogRow>();
  for (const row of rows) {
    if (!row.message_id) continue;
    const seen = latest.get(row.message_id);
    if (!seen || new Date(row.created_at) > new Date(seen.created_at)) {
      latest.set(row.message_id, row);
    }
  }
  return [...latest.values()].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}

function clampRange(from: unknown, to: unknown) {
  const end = typeof to === "string" && to ? new Date(to) : new Date();
  const start =
    typeof from === "string" && from
      ? new Date(from)
      : new Date(end.getTime() - 7 * 24 * 3600_000);
  return {
    start: (isNaN(start.getTime()) ? new Date(Date.now() - 7 * 864e5) : start).toISOString(),
    end: (isNaN(end.getTime()) ? new Date() : end).toISOString(),
  };
}

export const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "Authentication required" }, 401);

  const admin = createClient(
    process.env["SUPABASE_URL"]!,
    process.env["SUPABASE_SERVICE_ROLE_KEY"]!,
    { auth: { persistSession: false } },
  );

  const { data: userData, error: userError } = await admin.auth.getUser(token);
  const user = userData?.user;
  if (userError || !user) return json({ error: "Authentication required" }, 401);
  if (user.is_anonymous) return json({ error: "Admin access required" }, 403);

  const { data: isAdmin, error: roleError } = await admin.rpc("has_role", {
    _user_id: user.id,
    _role: "admin",
  });
  if (roleError || isAdmin !== true) return json({ error: "Admin access required" }, 403);

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return json({ error: "Invalid request body" }, 400);
  }

  const action = typeof body["action"] === "string" ? (body["action"] as string) : "";
  const { start, end } = clampRange(body["from"], body["to"]);
  const template = typeof body["template"] === "string" ? (body["template"] as string) : "";
  const status = typeof body["status"] === "string" ? (body["status"] as string) : "";

  /* ------------------------------ metrics ----------------------------- */
  if (action === "metrics" || action === "log") {
    let query = admin
      .from("email_send_log")
      .select("message_id, template_name, recipient_email, status, error_message, metadata, created_at")
      .gte("created_at", start)
      .lte("created_at", end)
      .order("created_at", { ascending: false })
      .limit(5000);
    if (template) query = query.eq("template_name", template);

    const { data, error } = await query;
    if (error) return json({ error: error.message }, 500);

    let rows = dedupe((data ?? []) as LogRow[]);
    if (status) rows = rows.filter((r) => r.status === status);

    const counts = rows.reduce<Record<string, number>>((acc, r) => {
      acc[r.status] = (acc[r.status] ?? 0) + 1;
      return acc;
    }, {});

    // Engagement lives in email_events (opened / clicked / bounced / complained).
    let eventsQuery = admin
      .from("email_events")
      .select("message_id, template_name, event_type")
      .gte("created_at", start)
      .lte("created_at", end)
      .limit(20000);
    if (template) eventsQuery = eventsQuery.eq("template_name", template);
    const { data: eventRows } = await eventsQuery;

    const engagement: Record<string, Set<string>> = {};
    for (const e of (eventRows ?? []) as { message_id: string; event_type: string }[]) {
      (engagement[e.event_type] ??= new Set()).add(e.message_id);
    }

    const summary = {
      total: rows.length,
      sent: counts["sent"] ?? 0,
      pending: counts["pending"] ?? 0,
      failed: (counts["failed"] ?? 0) + (counts["dlq"] ?? 0),
      dlq: counts["dlq"] ?? 0,
      suppressed: counts["suppressed"] ?? 0,
      opened: engagement["opened"]?.size ?? 0,
      clicked: engagement["clicked"]?.size ?? 0,
      bounced: engagement["bounced"]?.size ?? 0,
      complained: engagement["complained"]?.size ?? 0,
      deduped: ((data ?? []).length || 0) - rows.length,
    };

    const templates = [...new Set(((data ?? []) as LogRow[]).map((r) => r.template_name))].sort();

    return json({
      range: { start, end },
      summary,
      templates,
      rows: action === "log" ? rows.slice(0, 500) : rows.slice(0, 100),
    });
  }

  /* -------------------------------- dlq -------------------------------- */
  if (action === "dlq") {
    const { data, error } = await admin
      .from("email_send_log")
      .select("message_id, template_name, recipient_email, status, error_message, metadata, created_at")
      .eq("status", "dlq")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) return json({ error: error.message }, 500);
    return json({ rows: data ?? [] });
  }

  /* ------------------------------- message ----------------------------- */
  // Drill-down for a single email: every send-state row, every engagement
  // event, and any replay lineage in either direction. This is the view you
  // want when one user says "I never got it".
  if (action === "message") {
    const messageId = typeof body["messageId"] === "string" ? (body["messageId"] as string) : "";
    if (!messageId) return json({ error: "messageId is required" }, 400);

    const related = [messageId, `${messageId}:replay`];
    const originalId = messageId.endsWith(":replay") ? messageId.slice(0, -":replay".length) : null;
    if (originalId) related.push(originalId);

    const { data: attempts, error } = await admin
      .from("email_send_log")
      .select("id, message_id, template_name, recipient_email, status, error_message, metadata, created_at")
      .in("message_id", related)
      .order("created_at", { ascending: true });
    if (error) return json({ error: error.message }, 500);
    if ((attempts ?? []).length === 0) return json({ error: "Message not found" }, 404);

    const { data: events } = await admin
      .from("email_events")
      .select("id, message_id, event_type, url, user_agent, metadata, created_at")
      .in("message_id", related)
      .order("created_at", { ascending: true });

    const { data: idempotency } = await admin
      .from("email_idempotency")
      .select("idempotency_key, message_id, template_name, recipient_email, created_at")
      .in("message_id", related);

    const { data: suppression } = await admin
      .from("suppressed_emails")
      .select("email, reason, created_at")
      .eq("email", attempts![0]!.recipient_email)
      .maybeSingle();

    const latest = [...attempts!].reverse().find((a: any) => a.message_id === messageId) ?? attempts![attempts!.length - 1];

    return json({
      messageId,
      latest,
      attempts,
      events: events ?? [],
      replay: {
        // Present on the original once it has been replayed; present on the
        // replay itself as a pointer back to what it came from.
        replayedAs: (attempts ?? []).some((a: any) => a.message_id === `${messageId}:replay`)
          ? `${messageId}:replay`
          : null,
        replayOf: originalId,
        idempotencyKeys: idempotency ?? [],
      },
      suppression: suppression ?? null,
    });
  }

  /* ------------------------------ anomalies ---------------------------- */
  if (action === "anomalies") {
    const { data, error } = await admin
      .from("email_anomalies")
      .select("*")
      .order("window_start", { ascending: false })
      .limit(100);
    if (error) return json({ error: error.message }, 500);
    return json({ rows: data ?? [] });
  }

  /* ----------------------------- auth-preview -------------------------- */
  // Branded preview of the six Supabase auth emails, rendered from the exact
  // components the auth webhook uses, plus a live reachability audit of every
  // image so a broken logo is caught before a user ever sees it, plus a link
  // inspection so an admin can confirm the CTA href and the copy/paste fallback
  // both equal the dynamic action URL before anything is published.
  if (action === "auth-preview") {
    const { AUTH_TEMPLATES, authTemplate, authUrlPropFor } = await import(
      "@/lib/email-templates/authSamples"
    );
    const list = AUTH_TEMPLATES.map((t) => ({ key: t.key, label: t.displayName }));
    const key = typeof body["template"] === "string" ? (body["template"] as string) : "";
    if (!key) return json({ templates: list });

    const entry = authTemplate(key);
    if (!entry) return json({ error: "Unknown auth template" }, 404);

    // Optional: render against an admin-supplied action URL (e.g. one copied
    // from a real Supabase link) to verify the template passes it through
    // untouched. Must be http(s); anything else falls back to the sample.
    const supplied = typeof body["actionUrl"] === "string" ? (body["actionUrl"] as string).trim() : "";
    const urlProp = authUrlPropFor(key);
    const props: Record<string, unknown> = { ...(entry.props as Record<string, unknown>) };
    if (supplied && /^https?:\/\//i.test(supplied) && urlProp) props[urlProp] = supplied;
    const actionUrl = urlProp ? (props[urlProp] as string | undefined) ?? null : null;

    const { render } = await import("@react-email/render");
    const React = (await import("react")).default;
    const element = React.createElement(entry.component, props);
    const html = await render(element);
    const text = await render(element, { plainText: true });

    let images: unknown[] = [];
    if (body["auditImages"] === true) {
      const { auditHtmlImages } = await import("@/lib/email/imageAudit");
      images = await auditHtmlImages(html);
    }

    const { inspectAuthEmailHtml, linksMatchActionUrl } = await import("@/lib/email/authLinkAudit");
    const inspection = inspectAuthEmailHtml(html);

    return json({
      templates: list,
      template: key,
      label: entry.displayName,
      subject: entry.subject,
      html,
      text,
      images,
      actionUrl,
      links: {
        ...inspection,
        // reauthentication carries a code, not a link — nothing to match.
        matchesActionUrl: actionUrl ? linksMatchActionUrl(inspection, actionUrl) : null,
        textContainsActionUrl: actionUrl ? text.includes(actionUrl) : null,
      },
    });
  }

  /* --------------------------- auth-link-audit -------------------------- */
  // Which dynamic action URL was used for each auth email we sent. Sanitized at
  // write time: digests only, no tokens, no full URLs, no credentials.
  if (action === "auth-link-audit") {
    let query = admin
      .from("auth_email_link_audit")
      .select(
        "id, run_id, message_id, action_type, template_key, recipient_redacted, link_origin, link_path, link_type, redirect_to, token_param, token_digest, url_digest, link_valid, created_at",
      )
      .gte("created_at", start)
      .lte("created_at", end)
      .order("created_at", { ascending: false })
      .limit(300);
    if (template) query = query.eq("action_type", template);

    const { data, error } = await query;
    if (error) return json({ error: error.message }, 500);
    return json({ range: { start, end }, rows: data ?? [] });
  }


  /* ------------------------------- replay ------------------------------ */
  if (action === "replay") {
    const messageId = typeof body["messageId"] === "string" ? (body["messageId"] as string) : "";
    if (!messageId) return json({ error: "messageId is required" }, 400);

    const { data: original } = await admin
      .from("email_send_log")
      .select("message_id, template_name, recipient_email, status, metadata, created_at")
      .eq("message_id", messageId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!original) return json({ error: "Message not found" }, 404);

    const { decideReplay } = await import("@/lib/email/replayPolicy");
    const preflight = decideReplay(messageId, original.status, false);
    if (!preflight.allowed) return json({ error: preflight.reason }, 409);

    const { replayKey, replayMessageId } = preflight;

    // Idempotency gate: the unique key means a concurrent second replay loses
    // the insert race and is reported as already-replayed instead of sending.
    const { error: claimError } = await admin.from("email_idempotency").insert({
      idempotency_key: replayKey,
      message_id: replayMessageId,
      template_name: original.template_name,
      recipient_email: original.recipient_email,
    });
    if (claimError) {
      return json({ replayed: false, idempotent: true, reason: "Already replayed once" });
    }


    const { render } = await import("@react-email/render");
    const React = (await import("react")).default;
    const { TEMPLATES: templates } = await import("@/lib/email-templates/registry");
    const entry = (templates as Record<string, any>)[original.template_name];
    if (!entry) {
      return json({ error: `Template "${original.template_name}" is no longer registered` }, 400);
    }

    const templateData =
      (original.metadata as Record<string, unknown> | null)?.["templateData"] ??
      entry.previewData ??
      {};
    const element = React.createElement(entry.component, templateData as Record<string, unknown>);
    const html = await render(element);
    const text = await render(element, { plainText: true });
    const subject =
      typeof entry.subject === "function" ? entry.subject(templateData) : entry.subject;

    const { error: enqueueError } = await admin.rpc("enqueue_email", {
      queue_name: "transactional_emails",
      payload: {
        message_id: replayMessageId,
        to: original.recipient_email,
        from: `Gradr <noreply@gradr.me>`,
        sender_domain: "notify.gradr.me",
        subject,
        html,
        text,
        purpose: "transactional",
        label: original.template_name,
        idempotency_key: replayKey,
        queued_at: new Date().toISOString(),
      },
    });
    if (enqueueError) return json({ error: enqueueError.message }, 500);

    await admin.from("email_send_log").insert({
      message_id: replayMessageId,
      template_name: original.template_name,
      recipient_email: original.recipient_email,
      status: "pending",
      metadata: { replay_of: messageId, replayed_by: user.id },
    });

    return json({ replayed: true, idempotent: false, messageId: replayMessageId });
  }

  /* ------------------------------- preview ----------------------------- */
  if (action === "preview") {
    const { TEMPLATES: templates } = await import("@/lib/email-templates/registry");
    const list = Object.keys(templates as Record<string, unknown>).sort();
    const name = typeof body["template"] === "string" ? (body["template"] as string) : "";
    if (!name) return json({ templates: list });

    const entry = (templates as Record<string, any>)[name];
    if (!entry) return json({ error: "Unknown template" }, 404);

    const { render } = await import("@react-email/render");
    const React = (await import("react")).default;
    const sample = entry.previewData ?? {};
    const element = React.createElement(entry.component, sample);
    const html = await render(element);
    const text = await render(element, { plainText: true });
    const subject = typeof entry.subject === "function" ? entry.subject(sample) : entry.subject;

    return json({ templates: list, template: name, subject, html, text, sample });
  }

  return json({ error: "Unknown action" }, 400);
};
