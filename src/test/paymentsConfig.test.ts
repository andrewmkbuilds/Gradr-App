import { describe, expect, it } from "vitest";
import { diagnosePaymentsConfig, previewToken } from "@/lib/paymentsConfig";

describe("diagnosePaymentsConfig", () => {
  it("passes with a matching sandbox token and environment", () => {
    const d = diagnosePaymentsConfig({
      VITE_PAYMENTS_CLIENT_TOKEN: "test_abcdef1234567890",
      VITE_PAYMENTS_ENVIRONMENT: "sandbox",
    });
    expect(d.ok).toBe(true);
    expect(d.environment).toBe("sandbox");
    expect(d.missing).toEqual([]);
    expect(d.reason).toBeNull();
  });

  it("passes with a matching live token and environment", () => {
    const d = diagnosePaymentsConfig({
      VITE_PAYMENTS_CLIENT_TOKEN: "live_abcdef1234567890",
      VITE_PAYMENTS_ENVIRONMENT: "live",
    });
    expect(d.ok).toBe(true);
    expect(d.environment).toBe("live");
  });

  it("reports both variables when nothing is set", () => {
    const d = diagnosePaymentsConfig({});
    expect(d.ok).toBe(false);
    expect(d.missing).toEqual(["VITE_PAYMENTS_CLIENT_TOKEN", "VITE_PAYMENTS_ENVIRONMENT"]);
    expect(d.issues).toHaveLength(2);
    expect(d.issues.every((i) => i.fix.length > 0)).toBe(true);
  });

  it("treats blank strings as missing", () => {
    const d = diagnosePaymentsConfig({
      VITE_PAYMENTS_CLIENT_TOKEN: "   ",
      VITE_PAYMENTS_ENVIRONMENT: "sandbox",
    });
    expect(d.missing).toContain("VITE_PAYMENTS_CLIENT_TOKEN");
    expect(d.ok).toBe(false);
  });

  it("never defaults the environment", () => {
    const d = diagnosePaymentsConfig({ VITE_PAYMENTS_CLIENT_TOKEN: "test_abcdef1234567890" });
    expect(d.ok).toBe(false);
    expect(d.environment).toBeUndefined();
    expect(d.missing).toEqual(["VITE_PAYMENTS_ENVIRONMENT"]);
  });

  it("rejects an invalid environment value", () => {
    const d = diagnosePaymentsConfig({
      VITE_PAYMENTS_CLIENT_TOKEN: "test_abcdef1234567890",
      VITE_PAYMENTS_ENVIRONMENT: "Production",
    });
    expect(d.ok).toBe(false);
    expect(d.issues[0].message).toMatch(/must be 'sandbox' or 'live'/);
  });

  it("flags a sandbox token used with the live environment", () => {
    const d = diagnosePaymentsConfig({
      VITE_PAYMENTS_CLIENT_TOKEN: "test_abcdef1234567890",
      VITE_PAYMENTS_ENVIRONMENT: "live",
    });
    expect(d.ok).toBe(false);
    expect(d.tokenEnvironment).toBe("sandbox");
    expect(d.reason).toMatch(/mismatch/i);
  });

  it("never exposes the full token in the preview", () => {
    const token = "test_supersecrettokenvalue";
    const d = diagnosePaymentsConfig({
      VITE_PAYMENTS_CLIENT_TOKEN: token,
      VITE_PAYMENTS_ENVIRONMENT: "sandbox",
    });
    expect(d.tokenPreview).not.toContain("supersecret");
    expect(previewToken(token).length).toBeLessThan(token.length);
  });
});
