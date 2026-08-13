/**
 * Content-Security-Policy report sink.
 *
 * The site ships the candidate policy as `Content-Security-Policy-Report-Only`,
 * so browsers block nothing and instead POST a violation report here whenever a
 * resource *would* have been blocked. Those reports are the evidence we need
 * before flipping the policy to enforcing: if auth, Supabase, Paddle, PostHog,
 * Sentry, the interview socket or the installed PWA quietly rely on something
 * the policy forgets, it shows up here first instead of as a broken app.
 *
 * Two report formats exist in the wild and both are accepted:
 *   - legacy `application/csp-report`  → { "csp-report": { ... } }
 *   - Reporting API `application/reports+json` → [ { type: "csp-violation", body } ]
 */
import { corsHeaders } from "./shared/cors";
import { createClient } from "./shared/supabase";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

let _admin: ReturnType<typeof createClient> | null = null;
function db() {
  if (!_admin) {
    _admin = createClient(
      process.env["SUPABASE_URL"]!,
      process.env["SUPABASE_SERVICE_ROLE_KEY"]!,
      { auth: { persistSession: false } },
    );
  }
  return _admin;
}

/** A browser can fire hundreds of reports per page; keep one request bounded. */
const MAX_REPORTS_PER_REQUEST = 20;
const MAX_TEXT = 500;

const clip = (value: unknown): string | null => {
  if (typeof value !== "string" || !value) return null;
  return value.slice(0, MAX_TEXT);
};

const num = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : null;

function originOf(uri: string | null): string | null {
  if (!uri) return null;
  // Browsers use bare keywords like "inline", "eval" and "data" for non-URLs.
  if (!/^[a-z]+:\/\//i.test(uri)) return uri.split(/[?#]/)[0] ?? uri;
  try {
    return new URL(uri).origin;
  } catch {
    return null;
  }
}

function pathOf(uri: string | null): string | null {
  if (!uri) return null;
  try {
    return new URL(uri).pathname;
  } catch {
    return null;
  }
}

interface CspReportBody {
  "document-uri"?: string;
  documentURL?: string;
  referrer?: string;
  "violated-directive"?: string;
  "effective-directive"?: string;
  effectiveDirective?: string;
  "blocked-uri"?: string;
  blockedURL?: string;
  "source-file"?: string;
  sourceFile?: string;
  "line-number"?: number;
  lineNumber?: number;
  "column-number"?: number;
  columnNumber?: number;
  "status-code"?: number;
  statusCode?: number;
  disposition?: string;
  "script-sample"?: string;
  sample?: string;
}

/** Normalises either report dialect into one row shape. */
function toRow(body: CspReportBody, userAgent: string | null) {
  const documentUri = clip(body["document-uri"] ?? body.documentURL);
  const blockedUri = clip(body["blocked-uri"] ?? body.blockedURL);
  return {
    document_uri: documentUri,
    document_path: pathOf(documentUri),
    referrer: clip(body.referrer),
    violated_directive: clip(body["violated-directive"] ?? body.effectiveDirective),
    effective_directive: clip(
      body["effective-directive"] ?? body.effectiveDirective ?? body["violated-directive"],
    ),
    blocked_uri: blockedUri,
    blocked_origin: clip(originOf(blockedUri)),
    source_file: clip(body["source-file"] ?? body.sourceFile),
    line_number: num(body["line-number"] ?? body.lineNumber),
    column_number: num(body["column-number"] ?? body.columnNumber),
    status_code: num(body["status-code"] ?? body.statusCode),
    disposition: clip(body.disposition) ?? "report",
    script_sample: clip(body["script-sample"] ?? body.sample),
    user_agent: clip(userAgent),
    raw: body as Record<string, unknown>,
  };
}

function extractReports(payload: unknown): CspReportBody[] {
  if (Array.isArray(payload)) {
    // Reporting API envelope.
    return payload
      .filter((entry): entry is { type?: string; body?: CspReportBody } => !!entry && typeof entry === "object")
      .filter((entry) => !entry.type || entry.type === "csp-violation")
      .map((entry) => entry.body ?? {})
      .filter((body) => typeof body === "object");
  }
  if (payload && typeof payload === "object") {
    const legacy = (payload as { "csp-report"?: CspReportBody })["csp-report"];
    if (legacy && typeof legacy === "object") return [legacy];
    return [payload as CspReportBody];
  }
  return [];
}

export async function handler(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "Invalid report body" }, 400);
  }

  const reports = extractReports(payload).slice(0, MAX_REPORTS_PER_REQUEST);
  if (reports.length === 0) return json({ received: 0 });

  const userAgent = request.headers.get("user-agent");
  const rows = reports.map((body) => toRow(body, userAgent));

  const { error } = await db().from("csp_violation_reports").insert(rows);
  if (error) {
    console.error("csp-report insert failed", error.message);
    // Never fail loudly at the browser: a broken sink must not create noise.
    return json({ received: 0 }, 202);
  }

  return json({ received: rows.length }, 202);
}
