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
    expect(d.issues).toHaveLength(1);
    expect(d.issues[0].variable).toBe("VITE_PAYMENTS_CLIENT_TOKEN");
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

  it("derives the environment from the token prefix when the env var is omitted", () => {
    const d = diagnosePaymentsConfig({ VITE_PAYMENTS_CLIENT_TOKEN: "test_abcdef1234567890" });
    expect(d.ok).toBe(true);
    expect(d.environment).toBe("sandbox");
    expect(d.missing).toEqual(["VITE_PAYMENTS_ENVIRONMENT"]);
    expect(d.reason).toBeNull();
  });

  it("rejects an invalid environment value", () => {
    const d = diagnosePaymentsConfig({
      VITE_PAYMENTS_CLIENT_TOKEN: "test_abcdef1234567890",
      VITE_PAYMENTS_ENVIRONMENT: "Production",
    });
    expect(d.ok).toBe(false);
    expect(d.issues[0].message).toMatch(/must be 'sandbox' or 'live'/);
  });

  it("keeps checkout enabled and warns when the env override contradicts the token", () => {
    const d = diagnosePaymentsConfig({
      VITE_PAYMENTS_CLIENT_TOKEN: "test_abcdef1234567890",
      VITE_PAYMENTS_ENVIRONMENT: "live",
    });
    // The token prefix wins: a stale override must never disable purchases.
    expect(d.ok).toBe(true);
    expect(d.tokenEnvironment).toBe("sandbox");
    expect(d.environment).toBe("sandbox");
    expect(d.issues).toEqual([]);
    expect(d.warnings[0].message).toMatch(/using 'sandbox'/);
  });

  it("resolves live from a live token even when the override says sandbox", () => {
    const d = diagnosePaymentsConfig({
      VITE_PAYMENTS_CLIENT_TOKEN: "live_abcdef1234567890",
      VITE_PAYMENTS_ENVIRONMENT: "sandbox",
    });
    expect(d.ok).toBe(true);
    expect(d.environment).toBe("live");
    expect(d.reason).toBeNull();
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
