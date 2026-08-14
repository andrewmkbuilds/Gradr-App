import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Admin metrics aggregator.
 *
 * The revenue and usage tables are locked to their owner by RLS (a user can
 * only read their own subscription and their own meters). Admin dashboards
 * therefore cannot query them from the browser — this function does the
 * aggregation service-side, behind an explicit admin role check, and returns
 * only rolled-up numbers. No per-user PII leaves this boundary beyond the
 * email needed for the payment-recovery worklist.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/** Monthly USD list price per tier, in cents. Annual is billed up front. */
const MONTHLY_CENTS: Record<string, number> = { starter: 900, pro: 1900, advanced: 2900 };
const ANNUAL_CENTS: Record<string, number> = { starter: 8000, pro: 16000, advanced: 26000 };

/** Rough per-call AI cost estimate (USD cents) used for spend forecasting. */
const AI_COST_CENTS: Record<string, number> = {
  resume_analysis: 3,
  application: 4,
  interview_minutes: 6,
  job_match: 2,
  company_research: 5,
  practice_plan: 3,
};

function db() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

function monthKey(iso: string) {
  return iso.slice(0, 7);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const asUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await asUser.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);

    const { data: isAdmin } = await asUser.rpc("has_role", { _user_id: user.id, _role: "admin" });
    if (!isAdmin) return json({ error: "Forbidden" }, 403);

    const body = await req.json().catch(() => ({}));
    const env = body.environment === "live" ? "live" : "sandbox";
    const scope: "revenue" | "usage" | "all" = body.scope ?? "all";
    const admin = db();

    const result: Record<string, unknown> = { environment: env };

    if (scope === "revenue" || scope === "all") {
      const { data: subs } = await admin
        .from("subscribers")
        .select(
          "user_id, email, subscribed, subscription_tier, subscription_status, billing_interval, cancel_at_period_end, current_period_end, created_at, updated_at",
        )
        .eq("environment", env);

      const rows = subs ?? [];
      const active = rows.filter((r) => r.subscribed);

      let mrrCents = 0;
      const byTier: Record<string, number> = {};
      const byInterval: Record<string, number> = { monthly: 0, annual: 0 };

      for (const r of active) {
        const tier = (r.subscription_tier ?? "unknown").toLowerCase();
        const annual = (r.billing_interval ?? "monthly").startsWith("year") ||
          r.billing_interval === "annual";
        byTier[tier] = (byTier[tier] ?? 0) + 1;
        byInterval[annual ? "annual" : "monthly"] += 1;
        mrrCents += annual
          ? Math.round((ANNUAL_CENTS[tier] ?? 0) / 12)
          : (MONTHLY_CENTS[tier] ?? 0);
      }

      const atRisk = rows
        .filter((r) => ["past_due", "unpaid"].includes(r.subscription_status ?? ""))
        .map((r) => ({
          userId: r.user_id,
          email: r.email,
          tier: r.subscription_tier,
          status: r.subscription_status,
          periodEnd: r.current_period_end,
        }));

      const pendingCancel = rows.filter((r) => r.subscribed && r.cancel_at_period_end).length;

      // New paid subscriptions per month (last 6 months).
      const signupSeries: Record<string, number> = {};
      const cutoff = new Date(Date.now() - 6 * 30 * 864e5);
      for (const r of rows) {
        if (!r.created_at || new Date(r.created_at) < cutoff) continue;
        if (!r.subscription_tier) continue;
        const k = monthKey(r.created_at);
        signupSeries[k] = (signupSeries[k] ?? 0) + 1;
      }

      const { data: purchases } = await admin
        .from("purchases")
        .select("amount_total, currency, pack_key, pack_label, status, created_at")
        .eq("environment", env)
        .gte("created_at", cutoff.toISOString());

      const paid = (purchases ?? []).filter((p) => p.status === "completed" || p.status === "paid");
      const packRevenue: Record<string, { count: number; cents: number; label: string }> = {};
      for (const p of paid) {
        const key = p.pack_key;
        const entry = packRevenue[key] ?? { count: 0, cents: 0, label: p.pack_label ?? key };
        entry.count += 1;
        entry.cents += p.amount_total ?? 0;
        packRevenue[key] = entry;
      }

      result.revenue = {
        activeCount: active.length,
        totalCustomers: rows.length,
        mrrCents,
        arrCents: mrrCents * 12,
        arpuCents: active.length ? Math.round(mrrCents / active.length) : 0,
        byTier,
        byInterval,
        pendingCancel,
        churnRiskPercent: active.length
          ? Math.round(((pendingCancel + atRisk.length) / active.length) * 100)
          : 0,
        atRisk: atRisk.slice(0, 50),
        signupSeries: Object.entries(signupSeries).sort().map(([month, count]) => ({ month, count })),
        packRevenue: Object.entries(packRevenue)
          .map(([key, v]) => ({ key, ...v }))
          .sort((a, b) => b.cents - a.cents),
        oneTimeRevenueCents: paid.reduce((s, p) => s + (p.amount_total ?? 0), 0),
      };
    }

    if (scope === "usage" || scope === "all") {
      const since = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10);
      const { data: usage } = await admin
        .from("feature_usage")
        .select("feature, used, credits_used, period_start, user_id")
        .eq("environment", env)
        .gte("period_start", since);

      const rows = usage ?? [];
      const byFeature: Record<string, { used: number; credits: number; users: Set<string> }> = {};
      const byPeriod: Record<string, number> = {};

      for (const r of rows) {
        const f = byFeature[r.feature] ?? { used: 0, credits: 0, users: new Set<string>() };
        f.used += r.used ?? 0;
        f.credits += r.credits_used ?? 0;
        f.users.add(r.user_id);
        byFeature[r.feature] = f;
        const k = String(r.period_start).slice(0, 7);
        byPeriod[k] = (byPeriod[k] ?? 0) + (r.used ?? 0);
      }

      const features = Object.entries(byFeature)
        .map(([feature, v]) => ({
          feature,
          used: v.used,
          credits: v.credits,
          users: v.users.size,
          estimatedCostCents: Math.round(v.used * (AI_COST_CENTS[feature] ?? 3)),
        }))
        .sort((a, b) => b.used - a.used);

      result.usage = {
        features,
        totalCalls: features.reduce((s, f) => s + f.used, 0),
        totalCreditsSpent: features.reduce((s, f) => s + f.credits, 0),
        estimatedCostCents: features.reduce((s, f) => s + f.estimatedCostCents, 0),
        activeUsers: new Set(rows.map((r) => r.user_id)).size,
        series: Object.entries(byPeriod).sort().map(([month, used]) => ({ month, used })),
      };
    }

    return json(result);
  } catch (err) {
    console.error("[admin-metrics]", err);
    return json({ error: err instanceof Error ? err.message : "Unexpected error" }, 500);
  }
});
