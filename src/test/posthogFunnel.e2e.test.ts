/**
 * End-to-end conversion funnel contract.
 *
 * Walks a single simulated user through homepage → signup → activation →
 * checkout → paid, driving the real telemetry helpers the app calls (not
 * hand-written capture calls), and asserts that every step in the three
 * PostHog funnels fires **exactly once and in order**.
 *
 * This is the regression net for the dashboards provisioned by
 * scripts/setup-posthog-dashboard.mjs: rename or drop an event and the funnel
 * it feeds breaks here, before it breaks in PostHog.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const captured: Array<{ event: string; props: Record<string, unknown> }> = [];

vi.mock("@/lib/telemetry/posthog", () => ({
  phCapture: (event: string, props: Record<string, unknown>) => captured.push({ event, props }),
  phRegister: vi.fn(),
  phSetPerson: vi.fn(),
  phSetPersonOnce: vi.fn(),
}));
vi.mock("@/lib/telemetry/sentry", () => ({ addBreadcrumb: vi.fn() }));
vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn() }));

import {
  track,
  trackOnce,
  trackSignupCta,
  trackUpgradeCta,
  setAnalyticsUserContext,
  __resetTrackOnce,
} from "@/lib/telemetry/events";
import { completeSignupTracking, markSignupIntent, resetSignupTracking } from "@/lib/telemetry/signup";
import { trackFirstTime } from "@/lib/telemetry/activation";

const USER_ID = "11111111-2222-3333-4444-555555555555";

/** Mirrors the funnel definitions in scripts/setup-posthog-dashboard.mjs. */
const FUNNELS = {
  acquisition: ["homepage_viewed", "signup_cta_clicked", "signup_started", "account_created"],
  activation: ["account_created", "onboarding_completed", "resume_analysis_completed", "first_interview_completed"],
  revenue: ["pricing_viewed", "upgrade_cta_clicked", "checkout_started", "payment_completed", "upgraded_to_premium"],
} as const;

function names() {
  return captured.map((c) => c.event);
}

function indexOfEvent(event: string) {
  return names().indexOf(event);
}

/**
 * The paid half of the funnel is emitted server-side from the Paddle webhook,
 * so the test plays that role: one capture per event per provider event id,
 * exactly as supabase/functions/_shared/posthog.ts ledgers it.
 */
function simulateWebhookRevenueEvents(providerEventId: string) {
  const seen = new Set<string>();
  const emit = (event: "payment_completed" | "subscription_created" | "upgraded_to_premium") => {
    const dedupeKey = `${providerEventId}:${event}`;
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    track(event, { plan: "pro", billing_period: "monthly", provider: "paddle" });
  };
  emit("subscription_created");
  emit("payment_completed");
  emit("upgraded_to_premium");
  // Paddle retries webhooks; a replay must not double-count.
  emit("payment_completed");
}

/** Drives the full journey the way the app does. */
function runJourney({ replaySignup = false } = {}) {
  // --- Acquisition -----------------------------------------------------
  setAnalyticsUserContext({ status: "anonymous" });
  trackOnce("homepage_viewed", {}, "route");
  trackOnce("homepage_viewed", {}, "route"); // StrictMode double-effect
  trackSignupCta({ location: "hero", text: "Get started free", authenticated: false });

  // --- Signup ----------------------------------------------------------
  markSignupIntent("email");
  const user = {
    id: USER_ID,
    is_anonymous: false,
    created_at: new Date().toISOString(),
    app_metadata: { provider: "email" },
  } as never;
  completeSignupTracking(user);
  if (replaySignup) completeSignupTracking(user); // refresh / listener re-mount

  // --- Activation ------------------------------------------------------
  setAnalyticsUserContext({ status: "authenticated", plan: "free" });
  track("onboarding_started");
  track("onboarding_completed", { steps: 4 });
  track("resume_uploaded", { file_type: "pdf" });
  track("resume_analysis_started");
  track("resume_analysis_completed", { ats_score: 78 });
  trackFirstTime("first_interview_completed", USER_ID, { duration_seconds: 620 });
  trackFirstTime("first_interview_completed", USER_ID, { duration_seconds: 620 }); // second session

  // --- Revenue ---------------------------------------------------------
  trackOnce("pricing_viewed", {}, "route");
  trackUpgradeCta({ location: "pricing", text: "Go Pro", plan: "pro", billingPeriod: "monthly" });
  track("checkout_started", { plan: "pro", billing_period: "monthly", provider: "paddle" });
  simulateWebhookRevenueEvents("evt_01hxyz");
}

beforeEach(() => {
  captured.length = 0;
  __resetTrackOnce();
  resetSignupTracking();
  localStorage.clear();
  sessionStorage.clear();
});

describe("PostHog growth funnels — end to end", () => {
  it("fires every funnel step exactly once across the whole journey", () => {
    runJourney({ replaySignup: true });

    const allSteps = new Set([...FUNNELS.acquisition, ...FUNNELS.activation, ...FUNNELS.revenue]);
    for (const step of allSteps) {
      const count = names().filter((n) => n === step).length;
      expect(count, `${step} should fire exactly once, fired ${count}x`).toBe(1);
    }
  });

  it.each(Object.entries(FUNNELS))("emits the %s funnel steps in order", (_funnel, steps) => {
    runJourney();
    const positions = steps.map((step) => {
      const at = indexOfEvent(step);
      expect(at, `${step} was never captured`).toBeGreaterThanOrEqual(0);
      return at;
    });
    const sorted = [...positions].sort((a, b) => a - b);
    expect(positions, `steps out of order: ${steps.join(" → ")}`).toEqual(sorted);
  });

  it("does not count a replayed provider webhook as a second conversion", () => {
    runJourney();
    expect(names().filter((n) => n === "payment_completed")).toHaveLength(1);
    expect(names().filter((n) => n === "upgraded_to_premium")).toHaveLength(1);
  });

  it("attaches plan and billing period to every revenue event so the dashboard can break them down", () => {
    runJourney();
    for (const event of ["checkout_started", "payment_completed", "subscription_created", "upgraded_to_premium"]) {
      const entry = captured.find((c) => c.event === event);
      expect(entry, `${event} missing`).toBeDefined();
      expect(entry!.props).toMatchObject({ plan: "pro", billing_period: "monthly" });
    }
  });

  it("never leaks personal data into funnel events", () => {
    runJourney();
    for (const entry of captured) {
      for (const value of Object.values(entry.props)) {
        if (typeof value === "string") {
          expect(value, `${entry.event} leaked an email-shaped value`).not.toContain("@");
          expect(value.length).toBeLessThanOrEqual(96);
        }
      }
    }
  });

  it("keeps the provisioning script's funnel definitions inside the typed event vocabulary", async () => {
    const fs = await import("node:fs/promises");
    const source = await fs.readFile("src/lib/telemetry/events.ts", "utf8");
    for (const steps of Object.values(FUNNELS)) {
      for (const step of steps) {
        expect(source, `${step} is not declared in GradrEvent`).toContain(`| "${step}"`);
      }
    }
  });
});
