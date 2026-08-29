import { describe, expect, it } from "vitest";
import {
  isEntitled,
  isTrialing,
  trialEndOf,
  trialStartOf,
  type PaddleEventData,
} from "../../supabase/functions/_shared/paddleEvent";

const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString();

describe("Paddle trial parsing", () => {
  it("reads trial dates from SDK camelCase payloads", () => {
    const data: PaddleEventData = {
      status: "trialing",
      trialDates: { startsAt: "2026-09-01T00:00:00Z", endsAt: "2026-09-08T00:00:00Z" },
    };
    expect(trialStartOf(data)).toBe("2026-09-01T00:00:00Z");
    expect(trialEndOf(data)).toBe("2026-09-08T00:00:00Z");
  });

  it("reads trial dates from raw snake_case REST payloads", () => {
    const data: PaddleEventData = {
      status: "trialing",
      trial_dates: { starts_at: "2026-09-01T00:00:00Z", ends_at: "2026-09-08T00:00:00Z" },
    };
    expect(trialStartOf(data)).toBe("2026-09-01T00:00:00Z");
    expect(trialEndOf(data)).toBe("2026-09-08T00:00:00Z");
  });

  it("returns null when the subscription has no trial", () => {
    expect(trialEndOf({ status: "active" })).toBeNull();
    expect(trialStartOf({ status: "active" })).toBeNull();
  });

  it("treats a trialing status as in-trial", () => {
    expect(isTrialing({ status: "trialing" })).toBe(true);
  });

  it("falls back to the trial end date when the status is missing", () => {
    expect(isTrialing({ trialDates: { endsAt: inDays(3) } })).toBe(true);
    expect(isTrialing({ trialDates: { endsAt: inDays(-3) } })).toBe(false);
  });

  it("entitles a trialing subscriber to full plan access", () => {
    expect(isEntitled("trialing", inDays(7))).toBe(true);
  });

  it("keeps access until trial end after a cancel during the trial", () => {
    expect(isEntitled("canceled", inDays(4))).toBe(true);
    expect(isEntitled("canceled", inDays(-1))).toBe(false);
  });
});
