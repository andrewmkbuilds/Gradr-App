import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  RedirectDomainError,
  assertOAuthCallback,
  assertPasswordResetTarget,
  assertRedirectTarget,
  internalUrl,
  isKnownHost,
  preferActiveHost,
} from "@/lib/domain/redirectGuard";

/** Point jsdom at a given production hostname for the duration of a test. */
function setHost(origin: string) {
  const url = new URL(origin);
  Object.defineProperty(window, "location", {
    configurable: true,
    value: {
      ...window.location,
      href: url.href,
      origin: url.origin,
      hostname: url.hostname,
      protocol: url.protocol,
      pathname: url.pathname,
    },
  });
}

const realLocation = window.location;

describe("redirect guard", () => {
  // Unpinned, multi-surface default: deployments that pin a surface set these.
  beforeEach(() => {
    vi.stubEnv("VITE_GRADR_SURFACE", "");
    vi.stubEnv("VITE_APP_SUBDOMAIN_LIVE", "");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });
  afterEach(() => {
    Object.defineProperty(window, "location", { configurable: true, value: realLocation });
  });

  it("accepts every Gradr hostname and rejects look-alikes", () => {
    expect(isKnownHost("app.gradr.me")).toBe(true);
    expect(isKnownHost("docs.gradr.me")).toBe(true);
    expect(isKnownHost("id-preview--abc.lovable.app")).toBe(true);
    expect(isKnownHost("localhost")).toBe(true);
    expect(isKnownHost("gradr.me.evil.com")).toBe(false);
    expect(isKnownHost("gradrme.co")).toBe(false);
  });

  it("builds internal URLs on the active hostname", () => {
    setHost("https://app.gradr.me/auth");
    expect(internalUrl("/dashboard")).toBe("https://app.gradr.me/dashboard");
    setHost("https://gradr.me/");
    expect(internalUrl("/pricing")).toBe("https://gradr.me/pricing");
  });

  it("rewrites hardcoded apex URLs onto the active hostname in production", () => {
    setHost("https://app.gradr.me/dashboard");
    expect(preferActiveHost("https://gradr.me/career")).toBe("https://app.gradr.me/career");
    // Genuinely different surfaces are left alone.
    expect(preferActiveHost("https://docs.gradr.me/start")).toBe("https://docs.gradr.me/start");
  });

  it("leaves URLs untouched off production", () => {
    setHost("http://localhost:8080/auth");
    expect(preferActiveHost("https://gradr.me/pricing")).toBe("https://gradr.me/pricing");
  });

  it("rejects redirects to hosts Gradr does not serve", () => {
    setHost("https://app.gradr.me/auth");
    expect(() => assertRedirectTarget("https://evil.example/steal", { context: "test" })).toThrow(
      RedirectDomainError,
    );
  });

  it("rejects insecure production redirects", () => {
    setHost("https://app.gradr.me/auth");
    expect(() => assertRedirectTarget("http://app.gradr.me/dashboard", { context: "test" })).toThrow(
      RedirectDomainError,
    );
  });

  it("throws when an app-surface flow would cross to the apex", () => {
    setHost("https://app.gradr.me/auth");
    expect(() => assertOAuthCallback("https://gradr.me/auth")).toThrow(/cross|app surface|expected/i);
    expect(() => assertPasswordResetTarget("https://gradr.me/reset-password")).toThrow(
      RedirectDomainError,
    );
  });

  it("accepts same-surface callbacks, including deep links with next=", () => {
    setHost("https://app.gradr.me/auth?next=%2Fcareer");
    expect(assertOAuthCallback("https://app.gradr.me/auth?next=%2Fcareer")).toBe(
      "https://app.gradr.me/auth?next=%2Fcareer",
    );
    expect(assertPasswordResetTarget("https://app.gradr.me/reset-password?next=%2Fbilling")).toContain(
      "app.gradr.me/reset-password",
    );
  });

  it("still allows apex callbacks while subdomains are path-routed", () => {
    // gradr.me serves every surface today; the guard must not break that flow.
    setHost("https://gradr.me/auth");
    expect(assertOAuthCallback("https://gradr.me/auth?next=%2Fdashboard")).toContain("gradr.me/auth");
  });

  it("allows preview and local hosts to callback to themselves", () => {
    setHost("http://localhost:8080/auth");
    expect(assertOAuthCallback("http://localhost:8080/auth?next=%2Fdashboard")).toContain("localhost:8080");
  });
});
