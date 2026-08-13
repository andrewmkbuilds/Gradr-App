import { expect, test } from "@playwright/test";
import { OAUTH_SENSITIVE_PATHS, evaluateSecurityHeaders } from "../src/lib/security/headers";

/**
 * Runtime assertion that /auth and every OAuth-related path really serve CSP,
 * HSTS and Referrer-Policy. Runs against the dev server by default and against
 * https://gradr.me in CI when GRADR_TARGET_ORIGIN is set.
 */
const target = process.env["GRADR_TARGET_ORIGIN"] ?? "http://localhost:8080";
const secure = target.startsWith("https:");

for (const path of OAUTH_SENSITIVE_PATHS) {
  test(`security headers on ${path}`, async ({ request }) => {
    const response = await request.get(`${target}${path}`, { maxRedirects: 0 });
    expect(response.status(), `${path} should be reachable`).toBeLessThan(500);

    const headers = new Headers(response.headers() as Record<string, string>);
    const verdict = evaluateSecurityHeaders(headers, { secure });
    expect(verdict.problems, `${path} header problems`).toEqual([]);
  });
}

test("OAuth paths never allow cross-origin framing", async ({ request }) => {
  const response = await request.get(`${target}/auth`, { maxRedirects: 0 });
  const csp = response.headers()["content-security-policy"] ?? "";
  expect(csp).toContain("frame-ancestors 'self'");
  expect(response.headers()["x-frame-options"]).toBeTruthy();
});
