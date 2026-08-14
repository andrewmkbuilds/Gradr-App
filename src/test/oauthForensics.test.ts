/**
 * OAuth forensics: redaction, timeline assembly, filtering and exports.
 *
 * The critical guarantee under test is that no authorization code, token or
 * secret can survive into the admin UI *or* into a CSV/PDF download.
 */
import { describe, it, expect } from "vitest";
import { containsSensitive, redactMetadata, redactUrl } from "@/lib/oauth/redaction";
import { buildTimelines, isDeviation, type OAuthFlowEvent } from "@/lib/oauth/forensics";
import { filterTimelines } from "@/hooks/useOAuthForensics";
import { buildTimelinePdf, timelinesToRows, TIMELINE_CSV_COLUMNS } from "@/lib/oauth/exports";
import { toCsv } from "@/lib/exportFile";

const SECRET_URL =
  "https://gradr.me/auth?code=4/0AY0e-super-secret&state=abc123&access_token=ya29.a0AfB&scope=email";

function event(partial: Partial<OAuthFlowEvent> = {}): OAuthFlowEvent {
  return {
    id: crypto.randomUUID(),
    request_id: "req-1",
    user_id: null,
    provider: "google",
    account_type: "unknown",
    stage: "initiate",
    hop_index: 0,
    source_url: "https://gradr.me/auth",
    destination_url: "https://accounts.google.com/o/oauth2/v2/auth",
    final_url: null,
    state_result: "not_applicable",
    nonce_result: "not_applicable",
    deviation: false,
    deviation_type: null,
    note: null,
    metadata: {},
    created_at: "2026-08-14T10:00:00.000Z",
    ...partial,
  };
}

describe("redaction", () => {
  it("strips every sensitive query parameter", () => {
    const out = redactUrl(SECRET_URL);
    expect(out).not.toContain("4/0AY0e-super-secret");
    expect(out).not.toContain("ya29.a0AfB");
    expect(out).toContain("state=abc123");
    expect(out).toContain("scope=email");
    expect(containsSensitive(out)).toBe(false);
  });

  it("strips bare JWTs and bearer tokens from free text", () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.sig";
    expect(redactUrl(`token was ${jwt}`)).not.toContain(jwt);
    expect(redactUrl("Authorization: Bearer abc.def-ghi")).toContain("[REDACTED]");
  });

  it("redacts nested metadata keys", () => {
    const out = redactMetadata({ ok: "fine", nested: { id_token: "secret", url: SECRET_URL } }) as Record<
      string,
      Record<string, string>
    >;
    expect(out.nested.id_token).toBe("[REDACTED]");
    expect(containsSensitive(out.nested.url)).toBe(false);
  });

  it("flags unredacted values", () => {
    expect(containsSensitive(SECRET_URL)).toBe(true);
  });
});

describe("deviation detection", () => {
  it("accepts the expected final destination", () => {
    expect(isDeviation("https://gradr.me/auth")).toBe(false);
  });
  it("flags a different path on the production host", () => {
    expect(isDeviation("https://gradr.me/somewhere-else")).toBe(true);
  });
  it("flags a malformed URL", () => {
    expect(isDeviation("not a url")).toBe(true);
  });
});

describe("timelines", () => {
  const rows = [
    event({ request_id: "a", hop_index: 1, stage: "callback", state_result: "ok", final_url: "https://gradr.me/auth" }),
    event({ request_id: "a", hop_index: 0, stage: "initiate" }),
    event({
      request_id: "b",
      hop_index: 0,
      stage: "deviation",
      deviation: true,
      deviation_type: "unexpected_final_url",
      state_result: "mismatch",
      account_type: "new",
      created_at: "2026-08-14T11:00:00.000Z",
    }),
  ];

  it("groups hops by request and orders them", () => {
    const timelines = buildTimelines(rows);
    expect(timelines).toHaveLength(2);
    const a = timelines.find((t) => t.requestId === "a")!;
    expect(a.hops.map((h) => h.hop_index)).toEqual([0, 1]);
    expect(a.deviation).toBe(false);
    expect(a.stateResult).toBe("ok");
  });

  it("surfaces the worst validation outcome and deviation types", () => {
    const b = buildTimelines(rows).find((t) => t.requestId === "b")!;
    expect(b.stateResult).toBe("mismatch");
    expect(b.deviationTypes).toEqual(["unexpected_final_url"]);
  });

  it("filters by deviation, account type and free-text search", () => {
    const timelines = buildTimelines(rows);
    expect(filterTimelines(timelines, { deviation: "deviations" })).toHaveLength(1);
    expect(filterTimelines(timelines, { deviation: "clean" })).toHaveLength(1);
    expect(filterTimelines(timelines, { accountType: "new" })).toHaveLength(1);
    expect(filterTimelines(timelines, { stateResult: "mismatch" })).toHaveLength(1);
    expect(filterTimelines(timelines, { search: "accounts.google.com" }).length).toBeGreaterThan(0);
    expect(filterTimelines(timelines, { search: "nothing-matches" })).toHaveLength(0);
  });
});

describe("exports", () => {
  const timelines = buildTimelines([
    event({
      request_id: "x",
      destination_url: SECRET_URL,
      final_url: SECRET_URL,
      note: `landed with ${SECRET_URL}`,
    }),
  ]);

  it("CSV rows carry diagnostics but no secrets", () => {
    const rows = timelinesToRows(timelines);
    const csv = toCsv(rows, TIMELINE_CSV_COLUMNS);
    expect(csv).toContain("request_id");
    expect(csv).toContain("state_result");
    expect(csv).not.toContain("4/0AY0e-super-secret");
    expect(csv).not.toContain("ya29.a0AfB");
    for (const row of rows) {
      for (const value of Object.values(row)) {
        expect(containsSensitive(String(value))).toBe(false);
      }
    }
  });

  it("PDF text carries no secrets", () => {
    const doc = buildTimelinePdf(timelines);
    const decoded = atob(doc.output("datauristring").split(",")[1] ?? "");
    expect(decoded).not.toContain("4/0AY0e-super-secret");
    expect(decoded).not.toContain("ya29.a0AfB");
  });
});
