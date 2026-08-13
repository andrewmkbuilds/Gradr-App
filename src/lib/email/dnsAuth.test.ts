/**
 * Unit cover for the SPF/DKIM/DMARC evaluators.
 *
 * These decide whether the domain is "authenticated", so the interesting cases
 * are the ones that *look* configured but are not: `+all`, `p=none`, partial
 * rollout, revoked DKIM keys and misaligned signing domains.
 */
import { describe, expect, it } from "vitest";
import {
  domainsAlign,
  evaluateDkimRecord,
  evaluateDmarc,
  evaluateSpf,
  parseAuthenticationResults,
} from "./dnsAuth";

describe("evaluateSpf", () => {
  it("accepts a hard-fail record", () => {
    const result = evaluateSpf(["v=spf1 include:_spf.resend.com -all"]);
    expect(result.ok).toBe(true);
    expect(result.all).toBe("-all");
  });

  it("rejects a record that authorises the whole internet", () => {
    const result = evaluateSpf(["v=spf1 include:_spf.resend.com +all"]);
    expect(result.ok).toBe(false);
    expect(result.issues.join(" ")).toMatch(/\+all/);
  });

  it("flags duplicate SPF records as a permanent error", () => {
    const result = evaluateSpf(["v=spf1 -all", "v=spf1 include:other.com -all"]);
    expect(result.ok).toBe(false);
    expect(result.issues.join(" ")).toMatch(/More than one SPF record/);
  });

  it("flags exceeding the ten DNS lookup limit", () => {
    const includes = Array.from({ length: 11 }, (_, i) => `include:s${i}.example.com`).join(" ");
    const result = evaluateSpf([`v=spf1 ${includes} -all`]);
    expect(result.issues.join(" ")).toMatch(/limit is 10/);
  });

  it("reports a missing record", () => {
    expect(evaluateSpf(["some unrelated txt"]).ok).toBe(false);
  });
});

describe("evaluateDkimRecord", () => {
  const key = "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA" + "A".repeat(348);

  it("accepts a published 2048-bit key", () => {
    const result = evaluateDkimRecord("resend", [`v=DKIM1; k=rsa; p=${key}`]);
    expect(result.ok).toBe(true);
    expect(result.keyBits).toBeGreaterThanOrEqual(2048);
  });

  it("treats an empty p= as revoked", () => {
    const result = evaluateDkimRecord("resend", ["v=DKIM1; k=rsa; p="]);
    expect(result.ok).toBe(false);
    expect(result.issues.join(" ")).toMatch(/revokes signing/);
  });

  it("reports a selector with no record at all", () => {
    const result = evaluateDkimRecord("missing", []);
    expect(result.ok).toBe(false);
    expect(result.record).toBeNull();
  });
});

describe("evaluateDmarc", () => {
  it("accepts an enforcing policy with reporting", () => {
    const result = evaluateDmarc(["v=DMARC1; p=reject; rua=mailto:dmarc@gradr.me; adkim=s; aspf=s"]);
    expect(result.ok).toBe(true);
    expect(result.enforcing).toBe(true);
    expect(result.adkim).toBe("s");
  });

  it("does not count p=none as enforcement", () => {
    const result = evaluateDmarc(["v=DMARC1; p=none; rua=mailto:dmarc@gradr.me"]);
    expect(result.enforcing).toBe(false);
    expect(result.issues.join(" ")).toMatch(/monitoring only/);
  });

  it("flags a partial rollout", () => {
    const result = evaluateDmarc(["v=DMARC1; p=quarantine; pct=25; rua=mailto:d@gradr.me"]);
    expect(result.issues.join(" ")).toMatch(/25%/);
  });

  it("flags a missing aggregate report address", () => {
    const result = evaluateDmarc(["v=DMARC1; p=reject"]);
    expect(result.issues.join(" ")).toMatch(/rua/);
  });
});

describe("parseAuthenticationResults", () => {
  const header =
    "mx.google.com; dkim=pass header.i=@notify.gradr.me; spf=pass smtp.mailfrom=bounce.notify.gradr.me; dmarc=pass (p=REJECT)";

  it("extracts each verdict and domain", () => {
    const parsed = parseAuthenticationResults(header);
    expect(parsed.dkim).toBe("pass");
    expect(parsed.dkimDomain).toBe("notify.gradr.me");
    expect(parsed.spf).toBe("pass");
    expect(parsed.dmarc).toBe("pass");
  });

  it("aligns a signing subdomain in relaxed mode but not strict", () => {
    const parsed = parseAuthenticationResults(header);
    expect(domainsAlign(parsed.dkimDomain, "gradr.me")).toBe(true);
    expect(domainsAlign(parsed.dkimDomain, "gradr.me", true)).toBe(false);
  });

  it("never aligns a lookalike domain", () => {
    expect(domainsAlign("gradr.me.attacker.com", "gradr.me")).toBe(false);
  });
});
