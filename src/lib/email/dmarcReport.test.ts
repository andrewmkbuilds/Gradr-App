/**
 * Unit cover for DMARC aggregate report parsing.
 *
 * Providers differ in whitespace, casing and which optional elements they send,
 * so the parser is exercised against a realistic Google-shaped report including
 * one aligned source and one spoofing source.
 */
import { describe, expect, it } from "vitest";
import { parseDmarcXml } from "./dmarcReport";

const REPORT = `<?xml version="1.0" encoding="UTF-8" ?>
<feedback>
  <report_metadata>
    <org_name>google.com</org_name>
    <email>noreply-dmarc-support@google.com</email>
    <report_id>1234567890123456789</report_id>
    <date_range><begin>1740009600</begin><end>1740095999</end></date_range>
  </report_metadata>
  <policy_published>
    <domain>gradr.me</domain>
    <adkim>r</adkim>
    <aspf>r</aspf>
    <p>reject</p>
    <sp>reject</sp>
    <pct>100</pct>
  </policy_published>
  <record>
    <row>
      <source_ip>149.72.10.5</source_ip>
      <count>128</count>
      <policy_evaluated><disposition>none</disposition><dkim>pass</dkim><spf>pass</spf></policy_evaluated>
    </row>
    <identifiers><header_from>gradr.me</header_from></identifiers>
    <auth_results>
      <dkim><domain>notify.gradr.me</domain><selector>resend</selector><result>pass</result></dkim>
      <spf><domain>notify.gradr.me</domain><result>pass</result></spf>
    </auth_results>
  </record>
  <record>
    <row>
      <source_ip>203.0.113.9</source_ip>
      <count>4</count>
      <policy_evaluated><disposition>reject</disposition><dkim>fail</dkim><spf>fail</spf></policy_evaluated>
    </row>
    <identifiers><header_from>gradr.me</header_from></identifiers>
    <auth_results>
      <spf><domain>evil.example</domain><result>fail</result></spf>
    </auth_results>
  </record>
</feedback>`;

describe("parseDmarcXml", () => {
  const report = parseDmarcXml(REPORT);

  it("reads reporter metadata and window", () => {
    expect(report.orgName).toBe("google.com");
    expect(report.reportId).toBe("1234567890123456789");
    expect(report.dateBegin).toBe(new Date(1740009600 * 1000).toISOString());
  });

  it("reads the published policy", () => {
    expect(report.policyDomain).toBe("gradr.me");
    expect(report.policyP).toBe("reject");
    expect(report.policyPct).toBe(100);
  });

  it("counts aligned and failing volume separately", () => {
    expect(report.totalMessages).toBe(132);
    expect(report.passMessages).toBe(128);
    expect(report.failMessages).toBe(4);
  });

  it("captures the spoofing source with its failing results", () => {
    const spoof = report.records.find((r) => r.sourceIp === "203.0.113.9");
    expect(spoof?.aligned).toBe(false);
    expect(spoof?.disposition).toBe("reject");
    expect(spoof?.spfDomain).toBe("evil.example");
  });

  it("captures the legitimate sender's selector", () => {
    const good = report.records.find((r) => r.sourceIp === "149.72.10.5");
    expect(good?.dkimSelector).toBe("resend");
    expect(good?.aligned).toBe(true);
  });

  it("does not crash on an empty document", () => {
    const empty = parseDmarcXml("<feedback></feedback>");
    expect(empty.records).toEqual([]);
    expect(empty.totalMessages).toBe(0);
  });
});
