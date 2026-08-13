import { corsHeaders } from "./shared/cors";
import { createClient } from "./shared/supabase";

/**
 * Public affiliate lookup.
 *
 * Replaces the previously anon-executable SECURITY DEFINER RPCs
 * (`lookup_affiliate_by_code`, `get_affiliate_public_settings`). Those are now
 * revoked from `anon`/`authenticated`; this function reads them with the
 * service role and returns only the minimal, non-sensitive fields a visitor
 * needs to have their referral cookie set.
 */

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const CODE_RE = /^[A-Za-z0-9_-]{3,32}$/;

export const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const code = typeof body?.code === "string" ? body.code.trim() : null;
    if (code !== null && !CODE_RE.test(code)) {
      return json({ error: "Invalid affiliate code" }, 400);
    }

    const admin = createClient(
      process.env['SUPABASE_URL']!,
      process.env['SUPABASE_SERVICE_ROLE_KEY']!,
      { auth: { persistSession: false } },
    );

    const { data: settings } = await admin
      .from("affiliate_settings")
      .select(
        "program_enabled, cookie_duration_days, default_commission_type, default_commission_rate, minimum_payout_threshold, affiliate_terms",
      )
      .maybeSingle();

    let affiliate: { profileId: string; code: string; isActive: boolean } | null = null;
    let clickId: string | null = null;
    if (code) {
      const { data: profile } = await admin
        .from("affiliate_profiles")
        .select("id, affiliate_code, status")
        .eq("affiliate_code", code)
        .maybeSingle();
      if (profile) {
        affiliate = {
          profileId: profile.id,
          code: profile.affiliate_code,
          isActive: profile.status === "active",
        };

        // Click logging is server-side only: visitors have no write access to
        // `affiliate_clicks`, so a forged profile id / code pair cannot be
        // inserted from the browser.
        if (affiliate.isActive) {
          const str = (v: unknown, max: number) =>
            typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
          const { data: click } = await admin
            .from("affiliate_clicks")
            .insert({
              affiliate_profile_id: profile.id,
              affiliate_code: profile.affiliate_code,
              landing_page: str(body?.landing_page, 2048),
              utm_source: str(body?.utm_source, 200),
              utm_medium: str(body?.utm_medium, 200),
              utm_campaign: str(body?.utm_campaign, 200),
              visitor_key: str(body?.visitor_key, 128),
              user_agent: str(req.headers.get("user-agent"), 500),
            })
            .select("id")
            .maybeSingle();
          clickId = click?.id ?? null;
        }
      }
    }

    return json({
      settings: settings ?? null,
      affiliate,
      clickId,
    });

  } catch (_e) {
    return json({ error: "Affiliate lookup failed" }, 500);
  }
};
