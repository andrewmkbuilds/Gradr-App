/**
 * Ingest for client-side Postgres `permission denied` errors.
 *
 * Public pages must never trigger a permission error — most of all not one
 * that evaluates `public.has_role`, which signed-out visitors cannot execute.
 * The browser reports any such error here so the admin alert dashboard can
 * spot a regression the moment it ships, instead of waiting for a scan.
 *
 * The payload is deliberately tiny and non-identifying: route, whether the
 * visitor was signed in, the Postgres code and a truncated message.
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
    _admin = createClient(process.env["SUPABASE_URL"]!, process.env["SUPABASE_SERVICE_ROLE_KEY"]!, {
      auth: { persistSession: false },
    });
  }
  return _admin;
}

const clean = (v: unknown, max: number): string | null =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;

/** Best-effort relation name out of `permission denied for table foo`. */
function relationFrom(message: string): string | null {
  const m = /permission denied for (?:table|relation|function|view)\s+([\w.]+)/i.exec(message);
  return m?.[1] ?? null;
}

export const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const message = clean(body["message"], 500) ?? "";
    if (!message.toLowerCase().includes("permission denied")) {
      // Not our signal — accept quietly so the client never retries.
      return json({ ok: true, recorded: false });
    }

    await db()
      .from("permission_denied_signals")
      .insert({
        route: clean(body["route"], 200) ?? "unknown",
        authenticated: body["authenticated"] === true,
        code: clean(body["code"], 20),
        relation: clean(body["relation"], 120) ?? relationFrom(message),
        message,
        mentions_has_role: /has_role/i.test(message),
      });

    return json({ ok: true, recorded: true });
  } catch (err) {
    console.warn("permission-denied ingest failed", err);
    // Never surface an error: this endpoint is pure telemetry.
    return json({ ok: true, recorded: false });
  }
};
