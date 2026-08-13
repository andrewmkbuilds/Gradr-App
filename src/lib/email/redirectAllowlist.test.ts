/**
 * Allowlist gate for auth email links.
 *
 * `redirect_to` is the open-redirect surface of a Supabase auth link: the token
 * is verified on Supabase's origin and the browser is then bounced to whatever
 * that parameter says. These cases lock down both the issuing host and the
 * landing target, so a rewritten or attacker-influenced link can never leave
 * gradr.me while still carrying our branding.
 */
import { describe, expect, it } from "vitest";
import { validateAuthRedirect } from "./authLinkAudit";

const supabaseVerify = (redirectTo: string) =>
  `https://xaeyjrekewnwjujnrqgu.supabase.co/auth/v1/verify?token=abc&type=signup&redirect_to=${encodeURIComponent(
    redirectTo,
  )}`;

describe("validateAuthRedirect", () => {
  it("accepts a Supabase verify link landing on gradr.me", () => {
    const verdict = validateAuthRedirect(supabaseVerify("https://gradr.me/auth/callback?next=%2Fdashboard"));
    expect(verdict.reasons).toEqual([]);
    expect(verdict.allowed).toBe(true);
    expect(verdict.redirectHost).toBe("gradr.me");
  });

  it("accepts the www apex and a bare root landing", () => {
    expect(validateAuthRedirect(supabaseVerify("https://www.gradr.me/")).allowed).toBe(true);
  });

  it("accepts a first-party gradr.me confirm link", () => {
    expect(
      validateAuthRedirect("https://gradr.me/auth/confirm?token_hash=x&type=recovery").allowed,
    ).toBe(true);
  });

  it("rejects an off-site redirect target", () => {
    const verdict = validateAuthRedirect(supabaseVerify("https://evil.test/harvest"));
    expect(verdict.allowed).toBe(false);
    expect(verdict.reasons.join(" ")).toContain("off-site");
  });

  it("rejects a look-alike host that only prefixes our domain", () => {
    expect(validateAuthRedirect(supabaseVerify("https://gradr.me.evil.test/auth")).allowed).toBe(false);
  });

  it("rejects userinfo spoofing", () => {
    const verdict = validateAuthRedirect(supabaseVerify("https://gradr.me@evil.test/auth"));
    expect(verdict.allowed).toBe(false);
  });

  it("rejects a non-https landing page", () => {
    const verdict = validateAuthRedirect(supabaseVerify("http://gradr.me/dashboard"));
    expect(verdict.allowed).toBe(false);
    expect(verdict.reasons.join(" ")).toContain("https");
  });

  it("rejects an unexpected landing path", () => {
    const verdict = validateAuthRedirect(supabaseVerify("https://gradr.me/admin/oauth-forensics"));
    expect(verdict.allowed).toBe(false);
    expect(verdict.reasons.join(" ")).toContain("not an allowlisted landing path");
  });

  it("rejects an action link issued by a foreign host", () => {
    const verdict = validateAuthRedirect(
      "https://mail.tracking.test/click?u=https%3A%2F%2Fgradr.me%2Fauth",
    );
    expect(verdict.allowed).toBe(false);
    expect(verdict.reasons.join(" ")).toContain("Action host");
  });

  it("rejects a legacy lovable.app action link", () => {
    const verdict = validateAuthRedirect(
      "https://gradr-app.lovable.app/auth/v1/verify?token=abc&type=signup",
    );
    expect(verdict.allowed).toBe(false);
  });

  it("rejects an action path that is not a verification endpoint", () => {
    const verdict = validateAuthRedirect("https://gradr.me/settings?token=abc");
    expect(verdict.allowed).toBe(false);
    expect(verdict.reasons.join(" ")).toContain("Action path");
  });

  it("explains an empty or unparseable URL instead of throwing", () => {
    expect(validateAuthRedirect("").reasons[0]).toContain("No action URL");
    expect(validateAuthRedirect("not-a-url").reasons[0]).toContain("parseable");
    expect(validateAuthRedirect(undefined).allowed).toBe(false);
  });
});
