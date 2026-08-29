import { describe, expect, it } from "vitest";
import {
  amountCents,
  cancelsAtPeriodEnd,
  currencyOf,
  isEntitled,
  periodEndOf,
  priceExternalId,
  productExternalId,
  totalCents,
  userIdOf,
  type PaddleWebhookEvent,
} from "../../supabase/functions/_shared/paddleEvent.ts";

/**
 * Contract tests for the payments webhook payload parser.
 *
 * Fixtures mirror real Paddle deliveries: the Node SDK hands the handler
 * camelCase objects, while replayed/simulated events and the REST API use
 * snake_case. Both must resolve to the same values, or subscriptions land in
 * the database with a null user or a raw `pri_…` id and tier gating breaks.
 */

const subscriptionCreatedSdk: PaddleWebhookEvent = {
  eventType: "subscription.created",
  eventId: "evt_01hv3q2p9m0000000000000000",
  data: {
    id: "sub_01hv3q2p9m0000000000000000",
    customerId: "ctm_01hv3q2p9m0000000000000000",
    status: "active",
    customData: { userId: "3a5f2c1e-0000-4000-8000-000000000001" },
    currentBillingPeriod: { endsAt: "2099-01-01T00:00:00Z" },
    items: [
      {
        quantity: 1,
        price: {
          id: "pri_01hv3q2p9m0000000000000000",
          importMeta: { externalId: "pro_monthly" },
          unitPrice: { amount: "1900" },
        },
        product: { importMeta: { externalId: "pro_plan" } },
      },
    ],
  },
};

const subscriptionCreatedRaw: PaddleWebhookEvent = {
  eventType: "subscription.created",
  data: {
    id: "sub_01hv3q2p9m0000000000000000",
    customer_id: "ctm_01hv3q2p9m0000000000000000",
    status: "active",
    custom_data: { user_id: "3a5f2c1e-0000-4000-8000-000000000001" },
    current_billing_period: { ends_at: "2099-01-01T00:00:00Z" },
    items: [
      {
        quantity: 1,
        price: {
          id: "pri_01hv3q2p9m0000000000000000",
          import_meta: { external_id: "pro_monthly" },
          unit_price: { amount: "1900" },
        },
        product: { import_meta: { external_id: "pro_plan" } },
      },
    ],
  },
};

describe("paddle webhook payload contract", () => {
  it("reads the same values from SDK camelCase and raw snake_case events", () => {
    for (const event of [subscriptionCreatedSdk, subscriptionCreatedRaw]) {
      expect(userIdOf(event.data)).toBe("3a5f2c1e-0000-4000-8000-000000000001");
      expect(periodEndOf(event.data)).toBe("2099-01-01T00:00:00Z");
      expect(priceExternalId(event.data.items?.[0])).toBe("pro_monthly");
      expect(productExternalId(event.data.items?.[0])).toBe("pro_plan");
    }
  });

  it("prefers custom_data.external_id for in-app catalog prices", () => {
    const item = {
      price: {
        id: "pri_x",
        customData: { external_id: "starter_monthly" },
        importMeta: { externalId: "imported_id" },
      },
    };
    expect(priceExternalId(item)).toBe("starter_monthly");
  });

  it("returns undefined rather than a raw pri_ id when no external id exists", () => {
    // Writing `pri_…` would silently break tier gating: those ids differ
    // between the test and live catalogs.
    expect(priceExternalId({ price: { id: "pri_01hv3q2p9m" } })).toBeUndefined();
  });

  it("returns null for an unattributed checkout instead of throwing", () => {
    expect(userIdOf({ id: "sub_1" })).toBeNull();
    expect(periodEndOf({ id: "sub_1" })).toBeNull();
  });

  it("detects a scheduled cancellation in both casings", () => {
    expect(cancelsAtPeriodEnd({ scheduledChange: { action: "cancel" } })).toBe(true);
    expect(cancelsAtPeriodEnd({ scheduled_change: { action: "cancel" } })).toBe(true);
    expect(cancelsAtPeriodEnd({ scheduledChange: { action: "pause" } })).toBe(false);
    expect(cancelsAtPeriodEnd({})).toBe(false);
  });

  it("parses transaction totals from details.totals or top-level totals", () => {
    expect(totalCents({ details: { totals: { total: "1900" } } })).toBe(1900);
    expect(totalCents({ totals: { grand_total: 2400 } })).toBe(2400);
    expect(totalCents({})).toBeNull();
    expect(amountCents("")).toBeNull();
    expect(amountCents("not-a-number")).toBeNull();
    expect(currencyOf({ currency_code: "EUR" })).toBe("EUR");
    expect(currencyOf({ currencyCode: "USD" })).toBe("USD");
  });

  describe("entitlement rules", () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    const past = new Date(Date.now() - 86_400_000).toISOString();

    it("keeps access during dunning", () => {
      expect(isEntitled("past_due", past)).toBe(true);
    });

    it("keeps access after cancellation until the paid period ends", () => {
      expect(isEntitled("canceled", future)).toBe(true);
      expect(isEntitled("canceled", past)).toBe(false);
      expect(isEntitled("canceled", null)).toBe(false);
    });

    it("grants access to active and trialing subscriptions", () => {
      expect(isEntitled("active", null)).toBe(true);
      expect(isEntitled("trialing", null)).toBe(true);
    });

    it("denies unknown statuses", () => {
      expect(isEntitled("deleted", future)).toBe(false);
    });
  });
});
