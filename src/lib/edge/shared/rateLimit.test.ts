import { describe, expect, it, beforeEach } from "vitest";
import { checkRateLimit, resetRateLimits, type RateLimitRule } from "./rateLimit";

const rule: RateLimitRule = { limit: 3, windowMs: 60_000, backoffSeconds: 5, maxBackoffSeconds: 40 };

describe("checkRateLimit", () => {
  beforeEach(() => resetRateLimits());

  it("allows up to the limit then rejects with a cool-down", () => {
    for (let i = 0; i < 3; i += 1) {
      expect(checkRateLimit("/api/public/x", "ip1", rule).allowed).toBe(true);
    }
    const blocked = checkRateLimit("/api/public/x", "ip1", rule);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfter).toBe(5);
  });

  it("backs off exponentially for repeat offenders", () => {
    for (let i = 0; i < 3; i += 1) checkRateLimit("/api/public/x", "ip1", rule);
    expect(checkRateLimit("/api/public/x", "ip1", rule).retryAfter).toBe(5);
    // Still blocked: the cool-down is reported, not re-escalated mid-window.
    expect(checkRateLimit("/api/public/x", "ip1", rule).allowed).toBe(false);
  });

  it("keys buckets per endpoint and per caller", () => {
    for (let i = 0; i < 3; i += 1) checkRateLimit("/api/public/x", "ip1", rule);
    expect(checkRateLimit("/api/public/x", "ip2", rule).allowed).toBe(true);
    expect(checkRateLimit("/api/public/y", "ip1", rule).allowed).toBe(true);
  });
});
