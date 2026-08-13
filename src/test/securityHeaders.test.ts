import { describe, expect, it } from "vitest";
import {
  CONTENT_SECURITY_POLICY,
  DISCLOSURE_HEADERS,
  OAUTH_SENSITIVE_PATHS,
  applySecurityHeaders,
  evaluateSecurityHeaders,
} from "@/lib/security/headers";

const hardened = (init: Record<string, string> = {}, secure = true) =>
  applySecurityHeaders(new Headers(init), { secure });

describe("security header policy", () => {
  it("applies CSP, HSTS and Referrer-Policy to every response", () => {
    const headers = hardened();
    expect(headers.get("content-security-policy")).toBe(CONTENT_SECURITY_POLICY);
    expect(headers.get("strict-transport-security")).toMatch(/max-age=\d+/);
    expect(headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
    expect(headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("locks down framing, base URI, plugins and form targets", () => {
    const csp = hardened().get("content-security-policy")!;
    expect(csp).toContain("frame-ancestors 'self'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("form-action 'self'");
    // Google/Apple/Microsoft OAuth must remain valid form targets.
    expect(csp).toContain("https://accounts.google.com");
  });

  it("omits HSTS on plain-HTTP development origins", () => {
    expect(hardened({}, false).get("strict-transport-security")).toBeNull();
  });

  it("strips technology disclosure headers", () => {
    const headers = hardened(Object.fromEntries(DISCLOSURE_HEADERS.map((h) => [h, "leak"])));
    for (const name of DISCLOSURE_HEADERS) expect(headers.get(name)).toBeNull();
  });

  it("never overrides an upstream policy that is already set", () => {
    const headers = hardened({ "referrer-policy": "no-referrer" });
    expect(headers.get("referrer-policy")).toBe("no-referrer");
  });

  it("keeps the popup-friendly COOP that Google OAuth needs", () => {
    expect(hardened().get("cross-origin-opener-policy")).toBe("same-origin-allow-popups");
  });
});

describe("evaluateSecurityHeaders", () => {
  it("passes a hardened response", () => {
    const verdict = evaluateSecurityHeaders(hardened());
    expect(verdict.problems).toEqual([]);
    expect(verdict.ok).toBe(true);
  });

  it("flags a missing CSP, HSTS and Referrer-Policy", () => {
    const verdict = evaluateSecurityHeaders(new Headers());
    expect(verdict.ok).toBe(false);
    expect(verdict.problems).toContain("Missing Content-Security-Policy");
    expect(verdict.problems).toContain("Missing Strict-Transport-Security");
    expect(verdict.problems).toContain("Missing Referrer-Policy");
  });

  it("flags a short HSTS max-age and a leaky Referrer-Policy", () => {
    const verdict = evaluateSecurityHeaders(
      new Headers({
        "content-security-policy": CONTENT_SECURITY_POLICY,
        "strict-transport-security": "max-age=600",
        "referrer-policy": "unsafe-url",
        "x-content-type-options": "nosniff",
        "x-frame-options": "SAMEORIGIN",
      }),
    );
    expect(verdict.problems).toContain("HSTS max-age is below 180 days");
    expect(verdict.problems.some((p) => p.includes("unsafe-url"))).toBe(true);
  });

  it("flags CSP that allows framing by any origin", () => {
    const verdict = evaluateSecurityHeaders(
      new Headers({
        "content-security-policy": "frame-ancestors *; base-uri 'self'; object-src 'none'; form-action 'self'",
      }),
    );
    expect(verdict.problems).toContain("CSP allows framing by any origin");
  });

  it("covers /auth and the OAuth consent path", () => {
    expect(OAUTH_SENSITIVE_PATHS).toContain("/auth");
    expect(OAUTH_SENSITIVE_PATHS).toContain("/.lovable/oauth/consent");
  });
});
