import { describe, expect, it } from "vitest";
// plain ESM script, resolved by vitest at runtime
import {
  BANNED_PACKAGES,
  REQUIRED_OVERRIDES,
  VERSION_FLOORS,
  collectStaticFailures,
  readResolvedVersions,
  satisfiesFloor,
} from "../../scripts/dependency-audit.mjs";

/**
 * Offline guard for the dependency audit. Mirrors the static half of
 * `scripts/dependency-audit.mjs` so a downgrade fails `vitest run` too, not
 * only CI.
 */
describe("dependency floors", () => {
  it("keeps every patched package at or above its floor", () => {
    expect(collectStaticFailures()).toEqual([]);
  });

  it("compares versions correctly", () => {
    expect(satisfiesFloor("3.10.1", "3.10.1")).toBe(true);
    expect(satisfiesFloor("3.11.0", "3.10.1")).toBe(true);
    expect(satisfiesFloor("4.0.0", "3.10.1")).toBe(true);
    expect(satisfiesFloor("3.10.0", "3.10.1")).toBe(false);
    expect(satisfiesFloor("2.15.4", "3.10.1")).toBe(false);
  });

  it("keeps recharts on 3.x so the vulnerable lodash tree stays out", () => {
    const resolved = readResolvedVersions();
    expect(resolved?.recharts).toBeDefined();
    expect(satisfiesFloor(resolved!.recharts, VERSION_FLOORS.recharts)).toBe(true);
    for (const banned of BANNED_PACKAGES) {
      expect(resolved?.[banned]).toBeUndefined();
    }
  });

  it("retains the transitive overrides that patch advisories", () => {
    expect(Object.keys(REQUIRED_OVERRIDES).length).toBeGreaterThan(0);
  });
});
