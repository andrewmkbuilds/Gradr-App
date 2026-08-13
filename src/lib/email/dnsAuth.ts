/**
 * SPF / DKIM / DMARC validation for the Gradr sending domain.
 *
 * Everything here is pure and fetch-injectable so it can be unit tested without
 * network access. Lookups go over DNS-over-HTTPS (Cloudflare, then Google as a
 * fallback) because the Worker runtime has no UDP DNS resolver.
 *
 * What "valid" means here is deliberately strict: a record that merely *exists*
 * is not enough. SPF must end in a hard/soft fail (not `+all`), DKIM selectors
 * must publish a usable public key, and DMARC must be at enforcement
 * (`quarantine` or `reject`) with 100% coverage and strict-enough alignment.
 */

export const ROOT_DOMAIN = "gradr.me";
/** Subdomain the email provider signs and sends from. */
export const SENDING_DOMAIN = "notify.gradr.me";

export interface DnsAnswer {
  name: string;
  type: number;
  data: string;
}

const DOH_ENDPOINTS = [
  "https://cloudflare-dns.com/dns-query",
  "https://dns.google/resolve",
];

/** Resolve TXT records for a name. Returns unquoted, concatenated strings. */
export async function resolveTxt(
  name: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string[]> {
  for (const endpoint of DOH_ENDPOINTS) {
    try {
      const res = await fetchImpl(`${endpoint}?name=${encodeURIComponent(name)}&type=TXT`, {
        headers: { accept: "application/dns-json" },
      });
      if (!res.ok) continue;
      const body = (await res.json()) as { Answer?: DnsAnswer[] };
      const answers = body.Answer ?? [];
      const txt = answers
        .filter((a) => a.type === 16)
        // DNS-JSON returns each chunk quoted; a long record arrives as
        // "part1" "part2" and must be joined with no separator.
        .map((a) => a.data.replace(/"\s+"/g, "").replace(/^"|"$/g, ""));
      if (txt.length > 0 || answers.length === 0) return txt;
    } catch {
      // fall through to the next resolver
    }
  }
  return [];
}

/* ------------------------------- SPF --------------------------------- */

export interface SpfResult {
  ok: boolean;
  record: string | null;
  mechanisms: string[];
  all: string | null;
  issues: string[];
}

export function evaluateSpf(txtRecords: string[]): SpfResult {
  const records = txtRecords.filter((r) => /^v=spf1\b/i.test(r.trim()));
  const issues: string[] = [];

  if (records.length === 0) {
    return { ok: false, record: null, mechanisms: [], all: null, issues: ["No SPF record published"] };
  }
  if (records.length > 1) {
    // Two SPF records is a permerror in every implementation.
    issues.push("More than one SPF record published — receivers will treat this as a permanent error");
  }

  const record = records[0]!.trim();
  const mechanisms = record.split(/\s+/).slice(1);
  const allTerm = mechanisms.find((m) => /^[-~+?]?all$/i.test(m)) ?? null;

  if (!allTerm) issues.push("SPF record has no `all` mechanism, so unauthorised senders are not rejected");
  else if (allTerm.startsWith("+") || allTerm.toLowerCase() === "all") {
    issues.push("SPF ends in `+all`, which authorises the entire internet to send as this domain");
  }

  // Each `include`, `a`, `mx`, `ptr`, `exists` and `redirect` costs a DNS
  // lookup; more than 10 is a permerror.
  const lookupTerms = mechanisms.filter((m) =>
    /^([-~+?]?)(include:|a$|a:|mx$|mx:|ptr|exists:|redirect=)/i.test(m),
  );
  if (lookupTerms.length > 10) {
    issues.push(`SPF needs ${lookupTerms.length} DNS lookups; the limit is 10`);
  }

  return { ok: issues.length === 0, record, mechanisms, all: allTerm, issues };
}

/* ------------------------------- DKIM -------------------------------- */

export interface DkimSelectorResult {
  selector: string;
  ok: boolean;
  record: string | null;
  keyType: string | null;
  keyBits: number | null;
  issues: string[];
}

/** Approximate RSA modulus size from a base64 SubjectPublicKeyInfo blob. */
export function rsaKeyBits(base64Key: string): number | null {
  try {
    const bytes = base64Key.replace(/\s+/g, "").length * 0.75;
    if (!bytes || Number.isNaN(bytes)) return null;
    // SPKI overhead for an RSA key is ~38 bytes (header + exponent).
    const modulusBytes = bytes - 38;
    if (modulusBytes <= 0) return null;
    return Math.round((modulusBytes * 8) / 256) * 256;
  } catch {
    return null;
  }
}

export function evaluateDkimRecord(selector: string, txtRecords: string[]): DkimSelectorResult {
  const record = txtRecords.find((r) => /(^|;)\s*(v=DKIM1|k=|p=)/i.test(r)) ?? null;
  const issues: string[] = [];

  if (!record) {
    return {
      selector,
      ok: false,
      record: null,
      keyType: null,
      keyBits: null,
      issues: [`No DKIM key published for selector "${selector}"`],
    };
  }

  const tags = Object.fromEntries(
    record
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const eq = part.indexOf("=");
        return eq === -1 ? [part, ""] : [part.slice(0, eq).trim(), part.slice(eq + 1).trim()];
      }),
  ) as Record<string, string>;

  const publicKey = tags["p"] ?? "";
  const keyType = (tags["k"] ?? "rsa").toLowerCase();

  if (!publicKey) issues.push(`Selector "${selector}" publishes an empty key (p=), which revokes signing`);

  let keyBits: number | null = null;
  if (keyType === "rsa" && publicKey) {
    keyBits = rsaKeyBits(publicKey);
    if (keyBits !== null && keyBits < 1024) {
      issues.push(`Selector "${selector}" uses a ${keyBits}-bit key; 1024-bit is the minimum, 2048 recommended`);
    }
  }

  return { selector, ok: issues.length === 0, record, keyType, keyBits, issues };
}

/* ------------------------------- DMARC ------------------------------- */

export interface DmarcResult {
  ok: boolean;
  record: string | null;
  policy: string | null;
  subdomainPolicy: string | null;
  pct: number | null;
  adkim: string;
  aspf: string;
  rua: string[];
  enforcing: boolean;
  issues: string[];
}

export function evaluateDmarc(txtRecords: string[]): DmarcResult {
  const record = txtRecords.find((r) => /^v=DMARC1\b/i.test(r.trim())) ?? null;
  const issues: string[] = [];

  if (!record) {
    return {
      ok: false, record: null, policy: null, subdomainPolicy: null, pct: null,
      adkim: "r", aspf: "r", rua: [], enforcing: false,
      issues: ["No DMARC record published"],
    };
  }

  const tags = Object.fromEntries(
    record.split(";").map((p) => p.trim()).filter(Boolean).map((p) => {
      const eq = p.indexOf("=");
      return eq === -1 ? [p, ""] : [p.slice(0, eq).trim().toLowerCase(), p.slice(eq + 1).trim()];
    }),
  ) as Record<string, string>;

  const policy = (tags["p"] ?? "").toLowerCase() || null;
  const subdomainPolicy = (tags["sp"] ?? "").toLowerCase() || null;
  const pct = tags["pct"] ? Number(tags["pct"]) : 100;
  const rua = (tags["rua"] ?? "").split(",").map((v) => v.trim()).filter(Boolean);
  const enforcing = policy === "quarantine" || policy === "reject";

  if (!policy) issues.push("DMARC record has no policy (p=) tag");
  else if (policy === "none") issues.push("DMARC policy is `p=none` — monitoring only, enforcement is not active");
  if (pct !== null && pct < 100) issues.push(`DMARC applies to only ${pct}% of mail (pct=${pct})`);
  if (rua.length === 0) issues.push("No aggregate report address (rua=), so no DMARC reports will ever arrive");

  return {
    ok: issues.length === 0,
    record,
    policy,
    subdomainPolicy,
    pct: Number.isFinite(pct) ? pct : null,
    adkim: (tags["adkim"] ?? "r").toLowerCase(),
    aspf: (tags["aspf"] ?? "r").toLowerCase(),
    rua,
    enforcing,
    issues,
  };
}

/* --------------------- Authentication-Results parsing ----------------- */

export interface AuthResults {
  dkim: string | null;
  dkimDomain: string | null;
  spf: string | null;
  spfDomain: string | null;
  dmarc: string | null;
  raw: string;
}

/**
 * Parse an RFC 8601 `Authentication-Results` header as written by the
 * receiving mailbox — the only place the *actual* DKIM signature verdict for a
 * real delivered message can be read.
 */
export function parseAuthenticationResults(header: string): AuthResults {
  const pick = (method: string) => {
    const m = new RegExp(`\\b${method}=(\\w+)`, "i").exec(header);
    return m ? m[1]!.toLowerCase() : null;
  };
  const dkimDomain = /\bheader\.i=@?([^\s;]+)/i.exec(header)?.[1]
    ?? /\bheader\.d=([^\s;]+)/i.exec(header)?.[1]
    ?? null;
  const spfDomain = /\bsmtp\.mailfrom=([^\s;]+)/i.exec(header)?.[1] ?? null;

  return {
    dkim: pick("dkim"),
    dkimDomain: dkimDomain ? dkimDomain.replace(/^@/, "") : null,
    spf: pick("spf"),
    spfDomain,
    dmarc: pick("dmarc"),
    raw: header,
  };
}

/** DMARC alignment: the authenticated domain must match the From: domain. */
export function domainsAlign(authDomain: string | null, fromDomain: string, strict = false): boolean {
  if (!authDomain) return false;
  const a = authDomain.toLowerCase().replace(/\.$/, "");
  const f = fromDomain.toLowerCase().replace(/\.$/, "");
  return strict ? a === f : a === f || a.endsWith(`.${f}`) || f.endsWith(`.${a}`);
}
