import { describe, it, expect } from "vitest";
import { legalReadinessChecks, readSellerConfig } from "../../scripts/check-legal-readiness.mjs";

/**
 * Guards the Paddle seller-readiness fields on the privacy, terms and refund
 * pages. Fails the build before deployment if any required field disappears.
 */
describe("legal readiness (Paddle)", () => {
  const results = legalReadinessChecks();

  it.each(results.map((r) => r.label))("%s", (label) => {
    expect(results.find((r) => r.label === label)!.ok).toBe(true);
  });

  it("exposes a single configurable seller identity", () => {
    const cfg = readSellerConfig();
    expect(cfg.legalName.length).toBeGreaterThan(1);
    expect(cfg.contactEmail).toMatch(/^[^@\s]+@[^@\s]+\.[^@\s]+$/);
    expect(cfg.refundWindowDays).toBeGreaterThan(0);
  });
});
