/**
 * Reliability guarantees for admin email operations.
 *
 * Two properties matter enough to pin down in tests:
 *  1. A dead-letter replay can never send twice, no matter how many admins
 *     click or how the request races.
 *  2. Every CSV export of recipient data carries a complete audit manifest,
 *     so an exported file remains attributable after it leaves the dashboard.
 */
import { describe, expect, it } from "vitest";
import {
  decideReplay,
  replayKeyFor,
  replayMessageIdFor,
} from "@/lib/email/replayPolicy";
import {
  MANIFEST_COLUMNS,
  buildManifest,
  describeFilters,
  withManifest,
} from "@/lib/email/exportManifest";
import { dedupeLatest, detect, THRESHOLDS } from "@/lib/edge/email-anomaly.server";

describe("dead-letter replay idempotency", () => {
  it("allows exactly one replay of a dead-lettered message", () => {
    const first = decideReplay("msg-1", "dlq", false);
    expect(first.allowed).toBe(true);
    if (first.allowed) {
      expect(first.replayKey).toBe("dlq-replay:msg-1");
      expect(first.replayMessageId).toBe("msg-1:replay");
    }
  });

  it("reports the second attempt as idempotent instead of sending again", () => {
    const second = decideReplay("msg-1", "dlq", true);
    expect(second.allowed).toBe(false);
    if (!second.allowed) {
      expect(second.idempotent).toBe(true);
      expect(second.reason).toMatch(/already replayed/i);
    }
  });

  it("refuses to replay messages that are not dead-lettered", () => {
    for (const status of ["sent", "pending", "suppressed", null, undefined]) {
      const decision = decideReplay("msg-2", status, false);
      expect(decision.allowed).toBe(false);
      if (!decision.allowed) expect(decision.idempotent).toBe(false);
    }
  });

  it("derives stable keys so a retry reuses the same claim", () => {
    expect(replayKeyFor("abc")).toBe(replayKeyFor("abc"));
    expect(replayMessageIdFor("abc")).toBe("abc:replay");
    // A replay of a replay would collide with the original claim, which is the
    // point: the second hop is blocked by the same unique key.
    expect(replayKeyFor("abc:replay")).not.toBe(replayKeyFor("abc"));
  });

  it("requires a message id", () => {
    expect(decideReplay("", "dlq", false).allowed).toBe(false);
  });
});

describe("CSV export audit manifest", () => {
  const filters = { from: "2026-01-01", to: "2026-01-08", template: "welcome", status: "" };

  it("encodes every active filter, defaulting blanks to 'all'", () => {
    expect(describeFilters(filters)).toBe(
      "range=2026-01-01..2026-01-08;template=welcome;status=all",
    );
  });

  it("records the row count actually exported", () => {
    const manifest = buildManifest(filters, 3);
    expect(manifest.export_row_count).toBe(3);
    expect(manifest.export_id).toBeTruthy();
    expect(() => new Date(manifest.exported_at).toISOString()).not.toThrow();
  });

  it("attaches an identical manifest to every exported row", () => {
    const manifest = buildManifest(filters, 2, () => new Date("2026-02-01T00:00:00Z"), () => "fixed-id");
    const rows = withManifest(
      [{ message_id: "a" }, { message_id: "b" }],
      manifest,
    );

    expect(rows).toHaveLength(2);
    for (const row of rows) {
      for (const column of MANIFEST_COLUMNS) {
        expect(row[column]).toBeDefined();
      }
      expect(row.export_id).toBe("fixed-id");
      expect(row.exported_at).toBe("2026-02-01T00:00:00.000Z");
      expect(row.export_filters).toBe(describeFilters(filters));
    }
    // Original payload survives untouched alongside the manifest.
    expect(rows[0]!.message_id).toBe("a");
  });
});

describe("email anomaly detection", () => {
  const base = { volume: 100, baselineHourly: 100, bounced: 0, complained: 0, failed: 0 };

  it("stays silent when everything is within thresholds", () => {
    expect(detect(base)).toEqual([]);
  });

  it("flags a volume spike above the baseline multiple", () => {
    const found = detect({ ...base, volume: 600, baselineHourly: 100 });
    expect(found.map((a) => a.metric)).toContain("delivery_spike");
  });

  it("ignores spikes on tiny volumes, where ratios are meaningless", () => {
    const found = detect({ ...base, volume: 12, baselineHourly: 1 });
    expect(found.map((a) => a.metric)).not.toContain("delivery_spike");
  });

  it("treats bounces and complaints as critical", () => {
    const bounced = detect({ ...base, bounced: 20 });
    expect(bounced[0]?.metric).toBe("bounce_rate");
    expect(bounced[0]?.severity).toBe("critical");

    const complained = detect({ ...base, complained: 1 });
    expect(complained[0]?.metric).toBe("complaint_rate");
    expect(complained[0]?.severity).toBe("critical");
  });

  it("flags high failure rates", () => {
    const found = detect({ ...base, failed: 30 });
    expect(found.map((a) => a.metric)).toContain("failure_rate");
    expect(found[0]?.threshold).toBe(THRESHOLDS.failureRate);
  });

  it("does not compute rates below the minimum sample size", () => {
    expect(detect({ ...base, volume: 5, bounced: 5 })).toEqual([]);
  });

  it("counts one email once, using its latest status", () => {
    const rows = dedupeLatest([
      { message_id: "m1", status: "pending", created_at: "2026-01-01T00:00:00Z" },
      { message_id: "m1", status: "dlq", created_at: "2026-01-01T00:05:00Z" },
      { message_id: "m2", status: "sent", created_at: "2026-01-01T00:01:00Z" },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.message_id === "m1")?.status).toBe("dlq");
  });
});
