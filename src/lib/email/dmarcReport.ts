/**
 * DMARC aggregate (RUA) report parsing.
 *
 * Mailbox providers send one XML document per day per reporting org,
 * usually gzipped. The Worker runtime has no XML DOM, so this is a small
 * tolerant tag reader rather than a full parser — aggregate reports have a
 * fixed, shallow schema, and being tolerant beats rejecting a slightly
 * different dialect from one provider.
 */

export interface DmarcRecord {
  sourceIp: string;
  count: number;
  disposition: string | null;
  dkimResult: string | null;
  spfResult: string | null;
  headerFrom: string | null;
  envelopeFrom: string | null;
  dkimDomain: string | null;
  dkimSelector: string | null;
  spfDomain: string | null;
  /** DMARC passes when at least one of DKIM or SPF passes *and* aligns. */
  aligned: boolean;
}

export interface DmarcReport {
  orgName: string;
  orgEmail: string | null;
  reportId: string;
  dateBegin: string;
  dateEnd: string;
  policyDomain: string;
  policyP: string | null;
  policySp: string | null;
  policyPct: number | null;
  policyAdkim: string | null;
  policyAspf: string | null;
  records: DmarcRecord[];
  totalMessages: number;
  passMessages: number;
  failMessages: number;
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

/** First value of <tag> inside `scope`, trimmed, or null. */
export function tag(scope: string, name: string): string | null {
  const m = new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i").exec(scope);
  return m ? decodeXmlEntities(m[1]!.trim()) : null;
}

function blocks(scope: string, name: string): string[] {
  return Array.from(scope.matchAll(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "gi"))).map(
    (m) => m[1]!,
  );
}

function epochToIso(value: string | null): string {
  const n = Number(value);
  if (!value || Number.isNaN(n)) return new Date(0).toISOString();
  // Some providers already send ISO timestamps.
  if (!/^\d+$/.test(value.trim())) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? new Date(0).toISOString() : d.toISOString();
  }
  return new Date(n * 1000).toISOString();
}

export function parseDmarcXml(xml: string): DmarcReport {
  const meta = blocks(xml, "report_metadata")[0] ?? "";
  const policy = blocks(xml, "policy_published")[0] ?? "";
  const range = blocks(meta, "date_range")[0] ?? "";

  const policyDomain = tag(policy, "domain") ?? "";
  const adkim = tag(policy, "adkim");
  const aspf = tag(policy, "aspf");

  const records: DmarcRecord[] = blocks(xml, "record").map((rec) => {
    const row = blocks(rec, "row")[0] ?? rec;
    const evaluated = blocks(row, "policy_evaluated")[0] ?? "";
    const identifiers = blocks(rec, "identifiers")[0] ?? "";
    const authResults = blocks(rec, "auth_results")[0] ?? "";
    const dkimBlock = blocks(authResults, "dkim")[0] ?? "";
    const spfBlock = blocks(authResults, "spf")[0] ?? "";

    const dkimResult = (tag(evaluated, "dkim") ?? tag(dkimBlock, "result"))?.toLowerCase() ?? null;
    const spfResult = (tag(evaluated, "spf") ?? tag(spfBlock, "result"))?.toLowerCase() ?? null;

    return {
      sourceIp: tag(row, "source_ip") ?? "unknown",
      count: Number(tag(row, "count") ?? "0") || 0,
      disposition: tag(evaluated, "disposition"),
      dkimResult,
      spfResult,
      headerFrom: tag(identifiers, "header_from"),
      envelopeFrom: tag(identifiers, "envelope_from"),
      dkimDomain: tag(dkimBlock, "domain"),
      dkimSelector: tag(dkimBlock, "selector"),
      spfDomain: tag(spfBlock, "domain"),
      aligned: dkimResult === "pass" || spfResult === "pass",
    };
  });

  const totalMessages = records.reduce((sum, r) => sum + r.count, 0);
  const passMessages = records.filter((r) => r.aligned).reduce((sum, r) => sum + r.count, 0);

  return {
    orgName: tag(meta, "org_name") ?? "unknown",
    orgEmail: tag(meta, "email"),
    reportId: tag(meta, "report_id") ?? `${policyDomain}-${tag(range, "begin") ?? Date.now()}`,
    dateBegin: epochToIso(tag(range, "begin")),
    dateEnd: epochToIso(tag(range, "end")),
    policyDomain,
    policyP: tag(policy, "p"),
    policySp: tag(policy, "sp"),
    policyPct: tag(policy, "pct") ? Number(tag(policy, "pct")) : null,
    policyAdkim: adkim,
    policyAspf: aspf,
    records,
    totalMessages,
    passMessages,
    failMessages: totalMessages - passMessages,
  };
}

/** Accepts raw XML, gzipped XML, or a zip containing a single XML entry. */
export async function decodeReportPayload(bytes: Uint8Array): Promise<string> {
  const isGzip = bytes[0] === 0x1f && bytes[1] === 0x8b;
  if (isGzip) {
    const stream = new Blob([bytes as unknown as BlobPart]).stream().pipeThrough(
      new DecompressionStream("gzip"),
    );
    return await new Response(stream).text();
  }

  const text = new TextDecoder().decode(bytes);
  if (text.trimStart().startsWith("<")) return text;
  throw new Error("Unsupported report format — send raw XML or gzipped XML (.xml.gz)");
}
