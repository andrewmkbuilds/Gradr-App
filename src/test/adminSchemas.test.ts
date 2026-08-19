import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/telemetry/sentry", () => ({
  addBreadcrumb: vi.fn(),
  captureError: vi.fn(),
}));

import {
  adminVerificationRequestSchema,
  affiliateApplicationSchema,
  affiliateCommissionSchema,
  affiliateProfileSchema,
  affiliateTierSchema,
  discountRuleSchema,
  parseAdminRow,
  parseAdminRows,
} from "@/lib/admin/schemas";
import { captureError } from "@/lib/telemetry/sentry";

describe("admin runtime schemas", () => {
  it("keeps valid rows and passes through extra columns without failing", () => {
    const { rows, drift } = parseAdminRows(
      affiliateApplicationSchema,
      [
        {
          id: "a1",
          status: "pending",
          full_name: "Ada Lovelace",
          email: "ada@example.com",
          brand_name: "Analytical",
          website: "https://example.com",
          audience_type: "newsletter",
          audience_size: "10k",
          promotion_plan: "reviews",
          why_join: "fit",
          social_links: {},
          payout_details: {},
          admin_notes: null,
          rejection_reason: null,
          created_at: "2026-01-01T00:00:00Z",
          reviewed_date: null,
          // A brand-new column must never break the admin queue.
          referral_source: "twitter",
        },
      ],
      "affiliate_applications",
    );

    expect(drift).toBeNull();
    expect(rows).toHaveLength(1);
    expect(rows[0].full_name).toBe("Ada Lovelace");
    // Nulls normalise to "" so the UI can render/lowercase safely.
    expect(rows[0].admin_notes).toBe("");
  });

  it("drops only the invalid row and reports drift instead of crashing", () => {
    const { rows, drift } = parseAdminRows(
      affiliateProfileSchema,
      [
        { id: "p1", user_id: "u1", affiliate_code: "ADA10", status: "active", approval_date: null },
        // Missing the required `id` — this row alone is unusable.
        { user_id: "u2", affiliate_code: "BOB10" },
      ],
      "affiliate_profiles",
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].affiliate_code).toBe("ADA10");
    expect(drift).not.toBeNull();
    expect(drift?.invalid).toBe(1);
    expect(captureError).toHaveBeenCalled();
  });

  it("coerces numeric strings coming back from Postgres numerics", () => {
    const { rows } = parseAdminRows(
      affiliateCommissionSchema,
      [{
        id: "c1",
        status: "pending",
        commission_amount: "12.50",
        source_amount: "50.00",
        currency: "usd",
        conversion_type: "paid_upgrade",
        created_date: "2026-01-02T00:00:00Z",
        affiliate_profiles: { affiliate_code: "ADA10" },
      }],
      "affiliate_commissions",
    );

    expect(rows[0].commission_amount).toBe(12.5);
    expect(rows[0].affiliate_profiles?.affiliate_code).toBe("ADA10");
  });

  it("falls back to defaults for drifted-but-recoverable scalar fields", () => {
    const { rows } = parseAdminRows(
      affiliateTierSchema,
      [{ id: "t1", key: "gold", name: "Gold", min_referrals: null, bonus_rate: null, active: null }],
      "affiliate_tiers",
    );

    expect(rows[0].min_referrals).toBe(0);
    expect(rows[0].bonus_rate).toBe(0);
    expect(rows[0].active).toBe(true);
    expect(rows[0].color).toBe("#245F73");
  });

  it("validates discount rules with the columns the admin table renders", () => {
    const { rows } = parseAdminRows(
      discountRuleSchema,
      [{
        id: "d1",
        name: "Student 40%",
        kind: "eligibility",
        eligibility_type: "student",
        percentage: "40",
        active: true,
        advertised: true,
        requires_verification: true,
        stackable: false,
        applicable_plans: ["pro"],
        applicable_intervals: ["monthly", "annual"],
        max_redemptions: null,
        redemption_count: 3,
        starts_at: null,
        ends_at: null,
        created_at: "2026-01-01T00:00:00Z",
      }],
      "discount_rules",
    );

    expect(rows[0].percentage).toBe(40);
    expect(rows[0].max_redemptions).toBeNull();
    expect(rows[0].redemption_count).toBe(3);
  });

  it("returns null from parseAdminRow when a single row is unusable", () => {
    expect(parseAdminRow(adminVerificationRequestSchema, null, "admin_verification_requests")).toBeNull();
    expect(parseAdminRow(adminVerificationRequestSchema, { nope: true }, "admin_verification_requests")).toBeNull();
  });

  it("tolerates a non-array payload", () => {
    const { rows } = parseAdminRows(affiliateTierSchema, null, "affiliate_tiers");
    expect(rows).toEqual([]);
  });
});
