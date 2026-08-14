import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { planTier, resolveEnv } from "../_shared/entitlements.ts";

/**
 * Interview session gate (read-only).
 *
 * Resolves the caller's plan and returns the limits the studio needs to render
 * accurate gating: session length, monthly allowance, persona/difficulty
 * access and whether studio (ElevenLabs) voice is available.
 *
 * Deliberately does NOT consume an interview credit — `interview-coach` charges
 * once on the opening turn, so charging here too would double-bill.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface Entitlement {
  tier: "free" | "starter" | "pro";
  studioVoice: boolean;
  sessionsPerMonth: number | null;
  maxSessionMinutes: number;
  personas: string[] | null;
  difficulties: string[] | null;
}

const ENTITLEMENTS: Record<string, Entitlement> = {
  free: {
    tier: "free",
    studioVoice: false,
    sessionsPerMonth: 2,
    maxSessionMinutes: 10,
    personas: ["friendly", "hiring-manager"],
    difficulties: ["warmup", "standard"],
  },
  starter: {
    tier: "starter",
    studioVoice: true,
    sessionsPerMonth: 8,
    maxSessionMinutes: 20,
    personas: ["friendly", "hiring-manager", "technical"],
    difficulties: ["warmup", "standard", "senior"],
  },
  pro: {
    tier: "pro",
    studioVoice: true,
    sessionsPerMonth: null,
    maxSessionMinutes: 45,
    personas: null,
    difficulties: null,
  },
  advanced: {
    tier: "pro",
    studioVoice: true,
    sessionsPerMonth: null,
    maxSessionMinutes: 45,
    personas: null,
    difficulties: null,
  },
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const personaId = typeof body.personaId === "string" ? body.personaId : "hiring-manager";
    const difficultyId = typeof body.difficultyId === "string" ? body.difficultyId : "standard";

    const tierKey = await planTier(user.id, resolveEnv(body.environment));
    const ent = ENTITLEMENTS[tierKey] ?? ENTITLEMENTS.free;

    const limits = {
      tier: ent.tier,
      studioVoice: ent.studioVoice && Boolean(Deno.env.get("ELEVENLABS_API_KEY")),
      maxSessionMinutes: ent.maxSessionMinutes,
      sessionsPerMonth: ent.sessionsPerMonth,
      personas: ent.personas,
      difficulties: ent.difficulties,
    };

    if (ent.personas && !ent.personas.includes(personaId)) {
      return json({ error: "persona_not_entitled", reason: "This interviewer persona requires a higher plan.", limits }, 403);
    }
    if (ent.difficulties && !ent.difficulties.includes(difficultyId)) {
      return json({ error: "difficulty_not_entitled", reason: "This difficulty requires a higher plan.", limits }, 403);
    }

    return json({ ok: true, limits });
  } catch (e) {
    console.error("interview-session error:", e);
    return json({ error: "internal_error", reason: "An internal error occurred." }, 500);
  }
});
