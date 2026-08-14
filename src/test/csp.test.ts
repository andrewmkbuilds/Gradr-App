/**
 * Content Security Policy contract.
 *
 * The policy is delivered as a REPORT-ONLY response header by the edge (a
 * <meta>-delivered report-only policy is ignored by browsers, so it must never
 * come back). These tests pin the shared CI contract in
 * scripts/lib/securityHeaders.mjs, guard against an accidental flip to
 * enforcing, and cover the client-side violation summariser.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  REQUIRED_HEADERS,
  REPORT_ONLY_DIRECTIVES,
  REPORT_ONLY_ORIGINS,
} from "../../scripts/lib/securityHeaders.mjs";
import { summarizeViolation } from "@/lib/security/cspReport";

const HTML = readFileSync(join(process.cwd(), "index.html"), "utf8");

const reportOnlyRule = (REQUIRED_HEADERS as { name: string; test: (v: string) => boolean }[]).find(
  (r) => r.name === "content-security-policy-report-only",
)!;

/** A policy shaped like the one production serves. */
const VALID_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'self'",
  "script-src 'self' 'unsafe-inline' https://*.paddle.com https://accounts.google.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob: data:",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "connect-src 'self' blob: https://*.supabase.co wss://*.supabase.co https://*.lovable.cloud https://*.paddle.com https://accounts.google.com",
  "frame-src 'self' https://*.paddle.com https://accounts.google.com",
  "form-action 'self' https://accounts.google.com",
  "report-uri /api/public/csp-report",
].join("; ");

describe("CSP delivery", () => {
  it("is never delivered via a meta tag", () => {
    expect(HTML).not.toMatch(/http-equiv=["']Content-Security-Policy/i);
  });

  it("documents where the policy actually lives", () => {
    expect(HTML).toMatch(/REPORT-ONLY/);
  });
});

describe("report-only policy contract", () => {
  it("accepts a complete policy", () => {
    expect(reportOnlyRule.test(VALID_POLICY)).toBe(true);
  });

  it("requires a reporting endpoint", () => {
    expect(reportOnlyRule.test(VALID_POLICY.replace("; report-uri /api/public/csp-report", ""))).toBe(false);
  });

  it("requires default-src 'self'", () => {
    expect(reportOnlyRule.test(VALID_POLICY.replace("default-src 'self'", "default-src *"))).toBe(false);
  });

  it.each(REPORT_ONLY_DIRECTIVES as string[])("fails when %s is dropped", (name) => {
    const stripped = VALID_POLICY.split("; ")
      .filter((d) => !d.startsWith(`${name} `))
      .join("; ");
    expect(reportOnlyRule.test(stripped)).toBe(false);
  });

  it.each(REPORT_ONLY_ORIGINS as string[])("fails when the %s origin is dropped", (origin) => {
    expect(reportOnlyRule.test(VALID_POLICY.split(origin).join("https://example.invalid"))).toBe(false);
  });
});

describe("violation reporting", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("reduces a violation to an origin-level summary with no secrets", () => {
    const summary = summarizeViolation({
      effectiveDirective: "script-src",
      violatedDirective: "script-src",
      blockedURI: "https://evil.example.com/steal.js?token=secret",
      documentURI: "https://gradr.me/auth?code=abc",
      sample: "",
    } as SecurityPolicyViolationEvent);

    expect(summary.directive).toBe("script-src");
    expect(summary.blockedOrigin).toBe("https://evil.example.com");
    expect(summary.blockedOrigin).not.toContain("token");
    expect(summary.documentPath).toBe("/auth");
    expect(summary.documentPath).not.toContain("code");
  });

  it("keeps keyword blocked URIs intact", () => {
    const summary = summarizeViolation({
      effectiveDirective: "style-src-elem",
      blockedURI: "inline",
      documentURI: "https://gradr.me/",
      sample: "body{}",
    } as SecurityPolicyViolationEvent);
    expect(summary.blockedOrigin).toBe("inline");
    expect(summary.sample).toBe("body{}");
  });

  it("truncates long samples", () => {
    const summary = summarizeViolation({
      effectiveDirective: "script-src",
      blockedURI: "eval",
      documentURI: "https://gradr.me/",
      sample: "x".repeat(500),
    } as SecurityPolicyViolationEvent);
    expect(summary.sample!.length).toBe(120);
  });
});
