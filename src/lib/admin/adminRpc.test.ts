import { describe, expect, it } from "vitest";
import {
  AdminRpcError,
  formatAdminRpcError,
  isThrottleError,
  newRequestId,
  parseRequestId,
  requestIdFor,
} from "./adminRpc";

/**
 * `formatAdminRpcError` is the join between what an admin sees and the
 * `admin_rpc_audit` row the database guard wrote. If the request id ever stops
 * being rendered, a throttled or denied action becomes untraceable — so these
 * tests pin the id into the output and cover the malformed inputs a failed RPC
 * can realistically produce.
 */
describe("formatAdminRpcError", () => {
  it("always renders the request id for an AdminRpcError", () => {
    const text = formatAdminRpcError(
      new AdminRpcError("permission denied", "purge-abc-123", false, "42501"),
    );
    expect(text).toContain("permission denied");
    expect(text).toContain("request id: purge-abc-123");
    expect(parseRequestId(text)).toBe("purge-abc-123");
  });

  it("renders the id for a throttled error too", () => {
    const err = new AdminRpcError(
      "Too many admin requests — the server is throttling this action.",
      "settings-xyz-999",
      true,
    );
    expect(parseRequestId(formatAdminRpcError(err))).toBe("settings-xyz-999");
  });

  it("still renders an id segment when the request id is empty", () => {
    // An empty id means the header never made it to the server; the label must
    // still appear so the operator can tell "no id" from "id not shown".
    const text = formatAdminRpcError(new AdminRpcError("boom", "", false));
    expect(text).toContain("request id:");
    expect(parseRequestId(text)).toBeNull();
  });

  it("does not throw on a malformed id and keeps it greppable", () => {
    const weird = "id with spaces/and:punctuation";
    const text = formatAdminRpcError(new AdminRpcError("boom", weird, false));
    expect(text).toContain(weird);
    // Parsing stops at the first unsupported character rather than crashing.
    expect(parseRequestId(text)).toBe("id");
  });

  it("falls back to the message for a plain Error (no id available)", () => {
    expect(formatAdminRpcError(new Error("network down"))).toBe("network down");
  });

  it("handles non-Error throwables without crashing", () => {
    expect(formatAdminRpcError("string failure")).toBe("Something went wrong");
    expect(formatAdminRpcError(undefined)).toBe("Something went wrong");
    expect(formatAdminRpcError(null)).toBe("Something went wrong");
    expect(formatAdminRpcError({ message: "not an Error" })).toBe("Something went wrong");
  });

  it("keeps an empty error message from swallowing the id", () => {
    const text = formatAdminRpcError(new AdminRpcError("", "req-1", false));
    expect(parseRequestId(text)).toBe("req-1");
  });
});

describe("parseRequestId", () => {
  it("is case-insensitive and tolerant of extra whitespace", () => {
    expect(parseRequestId("failed (Request ID:   abc-1)")).toBe("abc-1");
  });

  it("returns null when no id is present", () => {
    expect(parseRequestId("permission denied")).toBeNull();
    expect(parseRequestId("")).toBeNull();
  });
});

describe("request ids", () => {
  it("mints unique, greppable ids", () => {
    const a = newRequestId("admin_run_rpc_audit_purge");
    const b = newRequestId("admin_run_rpc_audit_purge");
    expect(a).not.toBe(b);
    expect(a.startsWith("admin-run-rpc-audit-pur")).toBe(true);
  });

  it("reuses one id per logical read so retries stay grouped", () => {
    expect(requestIdFor("fn_a", "key")).toBe(requestIdFor("fn_a", "key"));
    expect(requestIdFor("fn_a", "key")).not.toBe(requestIdFor("fn_a", "other"));
  });
});

describe("isThrottleError", () => {
  it("matches the guard's wording regardless of case", () => {
    expect(isThrottleError("Rate Limit Exceeded for admin_x")).toBe(true);
    expect(isThrottleError("permission denied")).toBe(false);
    expect(isThrottleError(undefined)).toBe(false);
    expect(isThrottleError(null)).toBe(false);
  });
});
