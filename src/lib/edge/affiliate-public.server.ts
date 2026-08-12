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
      }
    }

    return json({
      settings: settings ?? null,
      affiliate,
    });
  } catch (_e) {
    return json({ error: "Affiliate lookup failed" }, 500);
  }
};
