import { createClient } from "@supabase/supabase-js";
import { connectorConfigured, gatewayJson, GatewayError } from "./shared/gateway";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const CAL = "google_calendar";
const KEY = "GOOGLE_CALENDAR_API_KEY";
const BASE = "/calendar/v3";

interface GEvent {
  id: string;
  summary?: string;
  description?: string;
  location?: string;
  htmlLink?: string;
  status?: string;
  start?: { dateTime?: string; date?: string; timeZone?: string };
  end?: { dateTime?: string; date?: string };
}

const INTERVIEW_HINT = /(interview|screen(ing)?\s*call|onsite|hiring\s*manager|technical\s*round|recruiter)/i;

function startOf(e: GEvent) {
  return e.start?.dateTime || (e.start?.date ? `${e.start.date}T09:00:00Z` : null);
}

export const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized", code: "unauthorized" }, 401);

    const scoped = createClient(process.env['SUPABASE_URL']!, process.env['SUPABASE_PUBLISHABLE_KEY']!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await scoped.auth.getUser();
    if (authError || !user) return json({ error: "Unauthorized", code: "unauthorized" }, 401);

    if (!connectorConfigured(KEY)) {
      return json({ error: "Google Calendar isn't connected yet.", code: "not_configured" }, 503);
    }

    const body = await req.json().catch(() => ({}));
    const action = body.action as "list" | "import" | "create";
    const calendarId = typeof body.calendarId === "string" && body.calendarId ? body.calendarId : "primary";

    if (action === "list" || action === "import") {
      const days = Math.min(Math.max(Number(body.days) || 30, 1), 120);
      const params = new URLSearchParams({
        timeMin: new Date().toISOString(),
        timeMax: new Date(Date.now() + days * 86_400_000).toISOString(),
        singleEvents: "true",
        orderBy: "startTime",
        maxResults: "50",
      });

      const data = await gatewayJson<{ items?: GEvent[] }>(
        CAL,
        KEY,
        `${BASE}/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
      );

      const events = (data.items ?? [])
        .filter((e) => e.status !== "cancelled" && startOf(e))
        .map((e) => ({
          externalId: e.id,
          title: e.summary || "Untitled event",
          startsAt: startOf(e)!,
          endsAt: e.end?.dateTime || null,
          location: e.location || null,
          htmlLink: e.htmlLink || null,
          looksLikeInterview: INTERVIEW_HINT.test(`${e.summary ?? ""} ${e.description ?? ""}`),
        }));

      if (action === "list") return json({ ok: true, events });

      const toImport = events.filter((e) => e.looksLikeInterview || body.importAll === true);
      if (toImport.length === 0) return json({ ok: true, imported: 0, events });

      const admin = createClient(process.env['SUPABASE_URL']!, process.env['SUPABASE_SERVICE_ROLE_KEY']!);
      const { error } = await admin.from("scheduled_interviews").upsert(
        toImport.map((e) => ({
          user_id: user.id,
          title: e.title.slice(0, 200),
          kind: "real",
          starts_at: e.startsAt,
          ends_at: e.endsAt,
          location: e.location,
          source: "google_calendar",
          external_event_id: e.externalId,
          calendar_id: calendarId,
          html_link: e.htmlLink,
        })),
        { onConflict: "user_id,source,external_event_id" },
      );
      if (error) throw error;

      return json({ ok: true, imported: toImport.length, events });
    }

    if (action === "create") {
      const title = typeof body.title === "string" ? body.title.trim().slice(0, 200) : "";
      const startsAt = typeof body.startsAt === "string" ? body.startsAt : "";
      if (!title || !startsAt || Number.isNaN(Date.parse(startsAt))) {
        return json({ error: "A title and a valid start time are required.", code: "invalid_input" }, 400);
      }
      const durationMin = Math.min(Math.max(Number(body.durationMin) || 30, 5), 180);
      const endsAt = new Date(Date.parse(startsAt) + durationMin * 60_000).toISOString();

      const created = await gatewayJson<GEvent>(
        CAL,
        KEY,
        `${BASE}/calendars/${encodeURIComponent(calendarId)}/events`,
        {
          method: "POST",
          body: JSON.stringify({
            summary: title,
            description: "Gradr AI mock interview — open Interview Studio to run this session.",
            start: { dateTime: new Date(startsAt).toISOString() },
            end: { dateTime: endsAt },
            reminders: { useDefault: false, overrides: [{ method: "popup", minutes: 30 }] },
          }),
        },
      );

      const admin = createClient(process.env['SUPABASE_URL']!, process.env['SUPABASE_SERVICE_ROLE_KEY']!);
      const { data: row, error } = await admin
        .from("scheduled_interviews")
        .upsert(
          {
            user_id: user.id,
            title,
            kind: "mock",
            target_role: typeof body.targetRole === "string" ? body.targetRole.slice(0, 120) : null,
            starts_at: new Date(startsAt).toISOString(),
            ends_at: endsAt,
            source: "google_calendar",
            external_event_id: created.id,
            calendar_id: calendarId,
            html_link: created.htmlLink ?? null,
          },
          { onConflict: "user_id,source,external_event_id" },
        )
        .select()
        .single();
      if (error) throw error;

      return json({ ok: true, event: row });
    }

    return json({ error: "Unknown action", code: "invalid_input" }, 400);
  } catch (e) {
    if (e instanceof GatewayError) {
      return json({ error: "Google Calendar request failed", status: e.status, details: e.body }, e.status);
    }
    console.error("calendar-sync error:", e);
    return json({ error: "Unexpected error", details: String(e) }, 500);
  }
};
