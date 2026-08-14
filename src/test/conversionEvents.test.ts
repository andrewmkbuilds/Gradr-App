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

function names() {
  return captured.map((c) => c.event);
}

beforeEach(() => {
  captured.length = 0;
  __resetTrackOnce();
  resetSignupTracking();
  localStorage.clear();
  sessionStorage.clear();
});

describe("event vocabulary", () => {
  it("captures the event with base properties attached", () => {
    setAnalyticsUserContext({ status: "authenticated", plan: "pro", subscriptionStatus: "active" });
    track("resume_analyzed", { ats_score: 82 });
    expect(captured[0].event).toBe("resume_analyzed");
    expect(captured[0].props).toMatchObject({ ats_score: 82, plan: "pro", user_status: "authenticated" });
    expect(captured[0].props.device_type).toBeDefined();
  });

  it("never sends email-shaped or long free-text values", () => {
    track("signup_completed", { email: "someone@example.com", note: "x".repeat(400), plan: "pro" });
    expect(captured[0].props).not.toHaveProperty("email");
    expect(captured[0].props).not.toHaveProperty("note");
    expect(captured[0].props.plan).toBe("pro");
  });

  it("de-duplicates view events so funnel rates stay accurate", () => {
    trackOnce("homepage_viewed", {}, "route");
    trackOnce("homepage_viewed", {}, "route");
    expect(names().filter((n) => n === "homepage_viewed")).toHaveLength(1);
  });

  it("records CTA intent with location and text", () => {
    trackSignupCta({ location: "hero", text: "Get started free", authenticated: false });
    trackUpgradeCta({ location: "pricing", text: "Choose Pro", plan: "pro", billingPeriod: "monthly" });
    expect(captured[0]).toMatchObject({
      event: "signup_cta_clicked",
      props: { cta_location: "hero", cta_text: "Get started free" },
    });
    expect(captured[1]).toMatchObject({ event: "upgrade_cta_clicked", props: { plan: "pro" } });
  });
});

describe("signup funnel", () => {
  const newUser = {
    id: "user-1",
    is_anonymous: false,
    created_at: new Date().toISOString(),
    app_metadata: { provider: "email" },
  } as never;

  it("emits started then completed exactly once per account", () => {
    markSignupIntent("email");
    expect(names()).toContain("signup_started");

    expect(completeSignupTracking(newUser)).toBe(true);
    expect(names()).toEqual(
      expect.arrayContaining(["account_created", "signup_completed", "signup_email_completed"]),
    );

    captured.length = 0;
    // A refresh or re-mounted auth listener must not double count.
    expect(completeSignupTracking(newUser)).toBe(false);
    expect(names()).toHaveLength(0);
  });

  it("treats an OAuth return without intent but a fresh account as a signup", () => {
    const google = { ...(newUser as object), id: "user-2", app_metadata: { provider: "google" } } as never;
    expect(completeSignupTracking(google)).toBe(true);
    expect(names()).toContain("signup_google_completed");
  });

  it("reports an existing account as a login, not a signup", () => {
    const returning = {
      id: "user-3",
      is_anonymous: false,
      created_at: new Date(Date.now() - 90 * 86400_000).toISOString(),
      app_metadata: { provider: "email" },
    } as never;
    expect(completeSignupTracking(returning)).toBe(false);
    expect(names()).toEqual(["login_completed"]);
  });

  it("ignores guest sessions", () => {
    const guest = { id: "guest-1", is_anonymous: true, created_at: new Date().toISOString(), app_metadata: {} } as never;
    expect(completeSignupTracking(guest)).toBe(false);
    expect(names()).toHaveLength(0);
  });
});

describe("activation milestones", () => {
  it("fires a first-time milestone once per account", () => {
    trackFirstTime("first_job_saved", "user-9", { source: "adzuna" });
    trackFirstTime("first_job_saved", "user-9", { source: "adzuna" });
    trackFirstTime("first_job_saved", "user-10", { source: "adzuna" });
    expect(names()).toEqual(["first_job_saved", "first_job_saved"]);
  });

  it("does nothing without a user id", () => {
    trackFirstTime("first_job_saved", undefined);
    expect(names()).toHaveLength(0);
  });
});
