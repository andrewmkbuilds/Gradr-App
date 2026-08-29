import { describe, expect, it } from "vitest";
import {
  isPriceUnavailable,
  preflightMessage,
  summarizePreflight,
  type PaymentsPreflight,
} from "@/lib/payments/preflight";

const checked = ["pro_monthly", "pro_annual", "applications_10"];

describe("summarizePreflight", () => {
  it("reports ok when every price resolves", () => {
    const p = summarizePreflight({
      environment: "live",
      checked,
      resolvedMap: { pro_monthly: "pri_1", pro_annual: "pri_2", applications_10: "pri_3" },
    });
    expect(p.status).toBe("ok");
    expect(p.missing).toEqual([]);
    expect(p.resolved).toHaveLength(3);
  });

  it("reports unavailable when the catalog is empty in this environment", () => {
    const p = summarizePreflight({ environment: "live", checked, resolvedMap: {} });
    expect(p.status).toBe("unavailable");
    expect(p.missing).toEqual(checked);
    expect(preflightMessage(p)).toMatch(/no prices exist in the live catalog/i);
  });

  it("reports partial when only some prices exist", () => {
    const p = summarizePreflight({
      environment: "sandbox",
      checked,
      resolvedMap: { pro_monthly: "pri_1" },
    });
    expect(p.status).toBe("partial");
    expect(p.missing).toEqual(["pro_annual", "applications_10"]);
  });

  it("ignores blank ids returned by the resolver", () => {
    const p = summarizePreflight({
      environment: "live",
      checked: ["pro_monthly"],
      resolvedMap: { pro_monthly: "" },
    });
    expect(p.status).toBe("unavailable");
  });

  it("never claims prices are missing when the resolver itself failed", () => {
    const p = summarizePreflight({ environment: "live", checked, error: "network down" });
    expect(p.status).toBe("error");
    // Critical: an unreachable resolver must not be reported as an empty
    // catalog, or a transient blip would disable every upgrade button.
    expect(p.missing).toEqual([]);
    expect(preflightMessage(p)).toMatch(/network down/);
  });

  it("reports disabled when payments are not configured", () => {
    const p = summarizePreflight({ environment: "sandbox", checked, configured: false });
    expect(p.status).toBe("disabled");
  });
});

describe("isPriceUnavailable", () => {
  const build = (over: Partial<PaymentsPreflight>): PaymentsPreflight => ({
    status: "ok",
    environment: "live",
    checked,
    resolved: checked,
    missing: [],
    checkedAt: new Date().toISOString(),
    durationMs: 1,
    ...over,
  });

  it("blocks a price that is known to be missing", () => {
    const p = build({ status: "partial", resolved: ["pro_monthly"], missing: ["pro_annual"] });
    expect(isPriceUnavailable(p, "pro_annual")).toBe(true);
    expect(isPriceUnavailable(p, "pro_monthly")).toBe(false);
  });

  it("does not block anything while the preflight has not run", () => {
    expect(isPriceUnavailable(null, "pro_monthly")).toBe(false);
  });

  it("does not block on resolver errors", () => {
    const p = build({ status: "error", resolved: [], missing: [], error: "boom" });
    expect(isPriceUnavailable(p, "pro_monthly")).toBe(false);
  });
});
