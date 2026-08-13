import { describe, expect, it } from "vitest";
import { describeRedirectTarget, evaluateClientName, sanitizeClientName } from "@/lib/oauth/clientTrust";
import { shouldNoIndex } from "@/lib/security/headers";

describe("OAuth client name sanitisation", () => {
  it("strips markup, URLs and control characters", () => {
    expect(sanitizeClientName('<b>Job\u202eBot</b> https://evil.example')).toBe("Job Bot");
  });

  it("caps runaway names", () => {
    expect(sanitizeClientName("a".repeat(500)).length).toBeLessThanOrEqual(64);
  });

  it("flags brand impersonation", () => {
    const verdict = evaluateClientName("Google Account Verification");
    expect(verdict.suspicious).toBe(true);
    expect(verdict.reasons.length).toBeGreaterThan(0);
  });

  it("flags security-prompt wording", () => {
    expect(evaluateClientName("Urgent: confirm your password").suspicious).toBe(true);
  });

  it("accepts an ordinary app name", () => {
    const verdict = evaluateClientName("Resume Sync CLI");
    expect(verdict.suspicious).toBe(false);
    expect(verdict.displayName).toBe("Resume Sync CLI");
  });

  it("treats a missing name as unsafe", () => {
    expect(evaluateClientName(undefined).suspicious).toBe(true);
  });
});

describe("redirect target disclosure", () => {
  it("exposes the full destination", () => {
    expect(describeRedirectTarget("https://app.example.com/cb?x=1")?.url).toBe("https://app.example.com/cb");
  });

  it("marks insecure destinations", () => {
    expect(describeRedirectTarget("http://app.example.com/cb")?.insecure).toBe(true);
  });

  it("rejects unparsable targets", () => {
    expect(describeRedirectTarget("not a url")).toBeNull();
  });
});

describe("noindex coverage", () => {
  it("covers authorization, credential and API surfaces", () => {
    for (const path of ["/.lovable/oauth/consent", "/auth", "/reset-password", "/api/public/email/click"]) {
      expect(shouldNoIndex(path)).toBe(true);
    }
  });

  it("leaves marketing pages indexable", () => {
    for (const path of ["/", "/pricing", "/blog/ai-resume-optimization"]) {
      expect(shouldNoIndex(path)).toBe(false);
    }
  });
});
