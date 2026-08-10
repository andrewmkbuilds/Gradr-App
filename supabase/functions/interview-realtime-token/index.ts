import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Secure session gateway for the Gemini Live realtime interview.
 *
 * Validates the caller, resolves their plan entitlement, enforces monthly
 * realtime quota, then mints a single-use ephemeral auth token. The long-lived
 * GEMINI_API_KEY never leaves this function.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const LIVE_MODEL = "models/gemini-2.0-flash-live-001";

interface Entitlement {
  tier: "free" | "starter" | "pro";
  realtimeVoice: boolean;
  sessionsPerMonth: number | null;
  maxSessionMinutes: number;
  personas: string[] | null;
  difficulties: string[] | null;
  premiumVoiceFallback: boolean;
}

const ENTITLEMENTS: Record<string, Entitlement> = {
  free: {
    tier: "free",
    realtimeVoice: false,
    sessionsPerMonth: 2,
    maxSessionMinutes: 10,
    personas: ["friendly", "hiring-manager"],
    difficulties: ["warmup", "standard"],
    premiumVoiceFallback: false,
  },
  starter: {
    tier: "starter",
    realtimeVoice: true,
    sessionsPerMonth: 8,
    maxSessionMinutes: 20,
    personas: ["friendly", "hiring-manager", "technical"],
    difficulties: ["warmup", "standard", "senior"],
    premiumVoiceFallback: true,
  },
  pro: {
    tier: "pro",
    realtimeVoice: true,
    sessionsPerMonth: null,
    maxSessionMinutes: 45,
    personas: null,
    difficulties: null,
    premiumVoiceFallback: true,
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
    const directive = typeof body.directive === "string" ? body.directive.slice(0, 8000) : "";
    const personaId = typeof body.personaId === "string" ? body.personaId : "hiring-manager";
    const difficultyId = typeof body.difficultyId === "string" ? body.difficultyId : "standard";
    const voiceName = typeof body.voiceName === "string" ? body.voiceName.slice(0, 40) : "Puck";
    /** Prior turns replayed when recovering a dropped session. */
    const resumeTranscript = Array.isArray(body.resumeTranscript) ? body.resumeTranscript.slice(-30) : [];

    // ---- Plan resolution -------------------------------------------------
    const { data: sub } = await supabase
      .from("subscribers")
      .select("subscribed, subscription_tier, subscription_status")
      .eq("user_id", user.id)
      .maybeSingle();

    const rawTier = (sub?.subscribed ? sub?.subscription_tier : null) ?? "free";
    const active = !sub?.subscription_status || ["active", "trialing", "past_due"].includes(sub.subscription_status);
    const tierKey = active && ENTITLEMENTS[String(rawTier).toLowerCase()]
      ? String(rawTier).toLowerCase()
      : "free";
    const ent = ENTITLEMENTS[tierKey];

    // ---- Quota -----------------------------------------------------------
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);

    const { count } = await supabase
      .from("interview_sessions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("created_at", monthStart.toISOString());

    const used = count ?? 0;
    const remaining = ent.sessionsPerMonth === null ? null : Math.max(0, ent.sessionsPerMonth - used);

    const limits = {
      tier: ent.tier,
      realtimeVoice: ent.realtimeVoice,
      maxSessionMinutes: ent.maxSessionMinutes,
      sessionsPerMonth: ent.sessionsPerMonth,
      sessionsUsed: used,
      sessionsRemaining: remaining,
      premiumVoiceFallback: ent.premiumVoiceFallback,
    };

    if (!ent.realtimeVoice) {
      return json({ error: "realtime_not_entitled", reason: "Realtime voice requires Starter or Pro.", limits }, 403);
    }
    if (remaining !== null && remaining <= 0) {
      return json({ error: "quota_exceeded", reason: "Monthly interview quota reached.", limits }, 403);
    }
    if (ent.personas && !ent.personas.includes(personaId)) {
      return json({ error: "persona_not_entitled", reason: "This interviewer persona requires a higher plan.", limits }, 403);
    }
    if (ent.difficulties && !ent.difficulties.includes(difficultyId)) {
      return json({ error: "difficulty_not_entitled", reason: "This difficulty requires a higher plan.", limits }, 403);
    }

    // ---- Ephemeral token -------------------------------------------------
    const geminiKey = Deno.env.get("GEMINI_API_KEY");
    if (!geminiKey) return json({ error: "gemini_unavailable", reason: "Realtime voice is not configured.", limits }, 503);

    const systemText = [
      "You are conducting a live, spoken mock interview. You are the interviewer, not an assistant.",
      "Speak naturally and conversationally, like a person on a video call: short sentences, contractions, occasional acknowledgements.",
      "Ask ONE question at a time and then stop talking and wait.",
      "If the candidate interrupts you, stop immediately, listen, and respond to what they actually said — never restart your previous sentence verbatim.",
      "If an answer is vague, ask a specific follow-up rather than moving on.",
      "Never read out markdown, bullet points, headings or numbered lists.",
      "Keep each turn under about 40 seconds of speech.",
      directive ? `\n--- Session brief ---\n${directive}\n--- End brief ---` : "",
      resumeTranscript.length
        ? `\nThis session is resuming after a connection drop. Continue naturally from this transcript instead of reintroducing yourself:\n${
            resumeTranscript
              .filter((m: any) => m && typeof m.content === "string")
              .map((m: any) => `${m.role === "assistant" ? "Interviewer" : "Candidate"}: ${String(m.content).slice(0, 600)}`)
              .join("\n")
          }`
        : "",
    ]
      .filter(Boolean)
      .join("\n");

    const now = Date.now();
    const tokenRes = await fetch(
      `https://generativelanguage.googleapis.com/v1alpha/auth_tokens?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uses: 1,
          // Token itself stays valid briefly; the session it opens may run longer.
          expireTime: new Date(now + 10 * 60 * 1000).toISOString(),
          newSessionExpireTime: new Date(now + 2 * 60 * 1000).toISOString(),
          liveConnectConstraints: {
            model: LIVE_MODEL,
            config: {
              responseModalities: ["AUDIO"],
              speechConfig: {
                voiceConfig: { prebuiltVoiceConfig: { voiceName } },
              },
              systemInstruction: { parts: [{ text: systemText }] },
              inputAudioTranscription: {},
              outputAudioTranscription: {},
              realtimeInputConfig: {
                automaticActivityDetection: {
                  disabled: false,
                  startOfSpeechSensitivity: "START_SENSITIVITY_HIGH",
                  endOfSpeechSensitivity: "END_SENSITIVITY_HIGH",
                  prefixPaddingMs: 120,
                  silenceDurationMs: 700,
                },
                // Candidate speech cuts the interviewer off mid-sentence.
                activityHandling: "START_OF_ACTIVITY_INTERRUPTS",
              },
            },
          },
          httpOptions: { apiVersion: "v1alpha" },
        }),
      },
    );

    if (!tokenRes.ok) {
      const detail = await tokenRes.text();
      console.error("gemini auth_tokens failed", tokenRes.status, detail);
      return json(
        { error: "token_mint_failed", reason: "Couldn't start the realtime voice session.", status: tokenRes.status, limits },
        502,
      );
    }

    const tokenBody = await tokenRes.json();
    const token = tokenBody?.name;
    if (!token) return json({ error: "token_mint_failed", reason: "No token returned.", limits }, 502);

    return json({
      token,
      model: LIVE_MODEL,
      expiresAt: new Date(now + 10 * 60 * 1000).toISOString(),
      limits,
    });
  } catch (e) {
    console.error("interview-realtime-token error:", e);
    return json({ error: "internal_error", reason: "An internal error occurred." }, 500);
  }
});
