#!/usr/bin/env node
/**
 * Provisions the "Gradr Growth Dashboard" and its three funnels in PostHog.
 *
 * Dashboards built by hand drift between environments and quietly break when
 * an event is renamed. This script is the source of truth: it is idempotent
 * (matched by insight/dashboard name), so re-running it after an event change
 * repairs the dashboard instead of creating a second one.
 *
 * Requires a personal API key — project tokens (`phc_…`) cannot write insights:
 *   POSTHOG_PERSONAL_API_KEY=phx_…  POSTHOG_PROJECT_ID=12345 \
 *   node scripts/setup-posthog-dashboard.mjs [--dry-run]
 */

const DRY_RUN = process.argv.includes("--dry-run");
const KEY = process.env.POSTHOG_PERSONAL_API_KEY;
const PROJECT_ID = process.env.POSTHOG_PROJECT_ID;
const REGION = process.env.POSTHOG_REGION || "eu";
const HOST = process.env.POSTHOG_HOST || (REGION === "us" ? "https://us.posthog.com" : "https://eu.posthog.com");

const DASHBOARD_NAME = "Gradr Growth Dashboard";

/** Funnel steps must match `GradrEvent` in src/lib/telemetry/events.ts exactly. */
const FUNNELS = [
  {
    name: "Funnel — Acquisition to signup",
    description: "Homepage visit → CTA click → signup started → account created.",
    steps: ["homepage_viewed", "signup_cta_clicked", "signup_started", "account_created"],
    window_days: 1,
  },
  {
    name: "Funnel — Signup to activation",
    description: "Account created → onboarding done → resume analyzed → first interview completed.",
    steps: ["account_created", "onboarding_completed", "resume_analysis_completed", "first_interview_completed"],
    window_days: 7,
  },
  {
    name: "Funnel — Activation to revenue",
    description: "Pricing viewed → upgrade CTA → checkout started → payment completed → premium.",
    steps: ["pricing_viewed", "upgrade_cta_clicked", "checkout_started", "payment_completed", "upgraded_to_premium"],
    window_days: 14,
  },
];

/** Trend + rate tiles that sit alongside the funnels. */
const TRENDS = [
  {
    name: "Signups per day",
    events: ["account_created"],
    display: "ActionsLineGraph",
  },
  {
    name: "Activation events per day",
    events: ["resume_analysis_completed", "mock_interview_completed", "job_application_tracked"],
    display: "ActionsLineGraph",
  },
  {
    name: "Paid conversions per day",
    events: ["payment_completed", "subscription_created", "upgraded_to_premium"],
    display: "ActionsLineGraph",
  },
  {
    name: "Checkout start → payment completed (conversion rate)",
    events: ["checkout_started", "payment_completed"],
    display: "ActionsLineGraph",
    // Read as a ratio of the two series; PostHog renders both lines and the
    // funnel tiles carry the exact percentage.
  },
  {
    name: "Subscription churn signals per day",
    events: ["subscription_cancelled"],
    display: "ActionsLineGraph",
  },
];

function requireEnv() {
  const missing = [];
  if (!KEY) missing.push("POSTHOG_PERSONAL_API_KEY");
  if (!PROJECT_ID) missing.push("POSTHOG_PROJECT_ID");
  if (missing.length) {
    console.error(`Missing required env: ${missing.join(", ")}`);
    console.error("Create a personal API key in PostHog → Settings → Personal API keys (insight:write, dashboard:write).");
    process.exit(1);
  }
}

async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(`${HOST}/api/projects/${PROJECT_ID}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`PostHog ${method} ${path} failed [${res.status}]: ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : null;
}

async function findByName(resource, name) {
  const data = await api(`/${resource}/?search=${encodeURIComponent(name)}&limit=100`);
  return (data?.results ?? []).find((item) => item.name === name) ?? null;
}

async function upsert(resource, name, payload) {
  const existing = await findByName(resource, name);
  if (DRY_RUN) {
    console.log(`[dry-run] would ${existing ? "update" : "create"} ${resource}: ${name}`);
    return { id: existing?.id ?? -1, name };
  }
  if (existing) {
    const updated = await api(`/${resource}/${existing.id}/`, { method: "PATCH", body: payload });
    console.log(`updated ${resource}: ${name}`);
    return updated;
  }
  const created = await api(`/${resource}/`, { method: "POST", body: payload });
  console.log(`created ${resource}: ${name}`);
  return created;
}

function funnelQuery(funnel) {
  return {
    kind: "InsightVizNode",
    source: {
      kind: "FunnelsQuery",
      series: funnel.steps.map((event) => ({ kind: "EventsNode", event, name: event })),
      dateRange: { date_from: "-30d" },
      funnelsFilter: {
        funnelVizType: "steps",
        funnelWindowInterval: funnel.window_days,
        funnelWindowIntervalUnit: "day",
      },
    },
  };
}

function trendQuery(trend) {
  return {
    kind: "InsightVizNode",
    source: {
      kind: "TrendsQuery",
      series: trend.events.map((event) => ({ kind: "EventsNode", event, name: event, math: "total" })),
      interval: "day",
      dateRange: { date_from: "-30d" },
      trendsFilter: { display: trend.display },
    },
  };
}

async function main() {
  requireEnv();
  console.log(`Provisioning "${DASHBOARD_NAME}" on ${HOST} (project ${PROJECT_ID})${DRY_RUN ? " [dry run]" : ""}`);

  const dashboard = await upsert("dashboards", DASHBOARD_NAME, {
    name: DASHBOARD_NAME,
    description: "Acquisition → activation → revenue. Provisioned by scripts/setup-posthog-dashboard.mjs.",
    pinned: true,
  });

  const insights = [
    ...FUNNELS.map((f) => ({ name: f.name, description: f.description, query: funnelQuery(f) })),
    ...TRENDS.map((t) => ({ name: t.name, description: `Events: ${t.events.join(", ")}`, query: trendQuery(t) })),
  ];

  for (const insight of insights) {
    await upsert("insights", insight.name, {
      name: insight.name,
      description: insight.description,
      query: insight.query,
      saved: true,
      dashboards: dashboard.id > 0 ? [dashboard.id] : undefined,
    });
  }

  console.log(
    DRY_RUN
      ? "Dry run complete — no changes written."
      : `Done. ${insights.length} insights on dashboard ${dashboard.id}.`,
  );
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
