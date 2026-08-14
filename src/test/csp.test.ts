/**
 * Content Security Policy contract.
 *
 * The policy is deliberately REPORT-ONLY: it must be present, must cover the
 * directives we care about, must whitelist every origin the app genuinely
 * needs, and must never be flipped to enforcing accidentally.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { summarizeViolation } from "@/lib/security/cspReport";

const HTML = readFileSync(join(process.cwd(), "index.html"), "utf8");

function policy(): string {
  const match = /http-equiv="Content-Security-Policy-Report-Only"\s+content="([^"]+)"/.exec(HTML);
  return match?.[1] ?? "";
}

function directive(name: string): string {
  const found = policy()
    .split(";")
    .map((d) => d.trim())
    .find((d) => d.startsWith(`${name} `) || d === name);
  return found ?? "";
}

describe("CSP meta policy", () => {
  it("ships a report-only policy", () => {
    expect(policy()).not.toBe("");
  });

  it("is NOT enforcing", () => {
    expect(HTML).not.toMatch(/http-equiv="Content-Security-Policy"/);
  });

  it.each([
    "default-src",
    "script-src",
    "style-src",
    "img-src",
    "connect-src",
    "frame-src",
    "worker-src",
    "base-uri",
    "form-action",
    "object-src",
  ])("declares %s", (name) => {
    expect(directive(name)).not.toBe("");
  });

  it("locks down the dangerous directives", () => {
    expect(directive("default-src")).toContain("'self'");
    expect(directive("base-uri")).toBe("base-uri 'self'");
    expect(directive("object-src")).toBe("object-src 'none'");
  });

  it("allows the backend, auth, payment and telemetry origins the app calls", () => {
    const connect = directive("connect-src");
    for (const origin of [
      "https://*.supabase.co",
      "wss://*.supabase.co",
      "https://*.lovable.cloud",
      "https://accounts.google.com",
      "https://*.paddle.com",
    ]) {
      expect(connect, `connect-src is missing ${origin}`).toContain(origin);
    }
    expect(directive("frame-src")).toContain("https://*.paddle.com");
    expect(directive("worker-src")).toContain("blob:"); // service worker + audio worklets
    expect(directive("media-src")).toContain("blob:"); // ElevenLabs interview audio
    expect(directive("font-src")).toContain("https://fonts.gstatic.com");
  });
});

describe("violation reporting", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("reduces a violation to an origin-level summary", () => {
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
});
