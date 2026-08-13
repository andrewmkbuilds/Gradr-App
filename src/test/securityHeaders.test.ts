import { describe, expect, it } from "vitest";
// @ts-expect-error - plain ESM helper shared with the CI script
import { ROUTES, checkRoute } from "../../scripts/lib/securityHeaders.mjs";

/**
 * Runtime security-header assertions.
 *
 * Runs against production (or SECURITY_HEADERS_TARGET) and verifies CSP, HSTS
 * and Referrer-Policy on `/auth` and OAuth-related paths. Skipped unless
 * RUN_HEADER_CHECKS=1 so local unit runs stay offline.
 */
const target = (process.env.SECURITY_HEADERS_TARGET || "https://gradr.me").replace(/\/$/, "");
const enabled = process.env.RUN_HEADER_CHECKS === "1";

describe.skipIf(!enabled)(`security headers on ${target}`, () => {
  for (const path of ROUTES as string[]) {
    it(`applies the expected headers to ${path}`, async () => {
      const result = await checkRoute(`${target}${path}`);
      expect(result.failures, result.failures.join("\n")).toEqual([]);
    }, 30_000);
  }
});
