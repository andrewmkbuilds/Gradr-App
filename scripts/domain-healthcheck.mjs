#!/usr/bin/env node
/**
 * Domain / DNS / TLS healthcheck for every Gradr hostname.
 *
 * For each host it reports:
 *   1. DNS  — A/CNAME records (and whether they point at Lovable hosting)
 *   2. TLS  — certificate negotiated without error, and its validity window
 *   3. HTTP — the *full* status chain, hop by hop
 *   4. Surface — that the served HTML is the Gradr bundle
 *
 * Hard failure (exit 1) when:
 *   - a hostname does not resolve or TLS fails
 *   - app.gradr.me redirects to gradr.me (the cross-surface bounce)
 *   - a hostname serves something that is not Gradr
 *
 * Usage: node scripts/domain-healthcheck.mjs [--json] [--allow-app-alias]
 */
import { promises as dns } from "node:dns";
import tls from "node:tls";

const LOVABLE_A_RECORD = "185.158.133.1";
const ROOT = "gradr.me";
const ALLOW_APP_ALIAS = process.argv.includes("--allow-app-alias");
const AS_JSON = process.argv.includes("--json");

const HOSTS = [
  { host: ROOT, surface: "home" },
  { host: `www.${ROOT}`, surface: "home", expectRedirect: true },
  { host: `app.${ROOT}`, surface: "app", mustNotRedirectToRoot: true },
  { host: `marketing.${ROOT}`, surface: "marketing" },
  { host: `docs.${ROOT}`, surface: "docs" },
  { host: `news.${ROOT}`, surface: "news" },
  { host: `earn.${ROOT}`, surface: "earn" },
  // Owned by the Gradr Partners project, not this repo. Reported but not
  // blocking until that surface is deployed and its TLS cert is issued.
  { host: `partners.${ROOT}`, surface: "partners", optional: true },
];

async function resolveDns(host) {
  try {
    return { type: "A", records: await dns.resolve4(host) };
  } catch {
    try {
      return { type: "CNAME", records: await dns.resolveCname(host) };
    } catch {
      return null;
    }
  }
}

function checkTls(host) {
  return new Promise((resolve) => {
    const socket = tls.connect({ host, port: 443, servername: host, timeout: 10_000 }, () => {
      const cert = socket.getPeerCertificate();
      resolve({
        ok: socket.authorized || socket.authorizationError === null,
        error: socket.authorizationError ? String(socket.authorizationError) : null,
        validTo: cert?.valid_to ?? null,
        issuer: cert?.issuer?.O ?? null,
      });
      socket.end();
    });
    socket.on("timeout", () => {
      socket.destroy();
      resolve({ ok: false, error: "TLS handshake timed out", validTo: null, issuer: null });
    });
    socket.on("error", (error) => resolve({ ok: false, error: error.message, validTo: null, issuer: null }));
  });
}

/** Follows redirects manually so every hop is visible in the report. */
export async function statusChain(startUrl, maxHops = 6) {
  const chain = [];
  let url = startUrl;
  for (let hop = 0; hop < maxHops; hop += 1) {
    let response;
    try {
      response = await fetch(url, { redirect: "manual", headers: { "user-agent": "gradr-healthcheck" } });
    } catch (error) {
      chain.push({ url, error: error instanceof Error ? error.message : String(error) });
      return chain;
    }
    const location = response.headers.get("location");
    chain.push({ url, status: response.status, location: location ?? null });
    if (response.status < 300 || response.status >= 400 || !location) {
      chain.at(-1).body = response.status < 400 ? (await response.text()).slice(0, 4000) : "";
      return chain;
    }
    url = new URL(location, url).toString();
  }
  chain.push({ url, error: "Too many redirects" });
  return chain;
}

function hostOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

async function check(entry) {
  const result = { ...entry, notes: [], ok: false, dns: null, tls: null, chain: [] };

  const records = await resolveDns(entry.host);
  result.dns = records;
  if (!records) {
    result.notes.push("DNS does not resolve — add the A record at the registrar and connect the domain.");
    return result;
  }
  if (records.type === "A" && !records.records.includes(LOVABLE_A_RECORD)) {
    result.notes.push(`A record is ${records.records.join(", ")}, expected ${LOVABLE_A_RECORD}.`);
  }

  result.tls = await checkTls(entry.host);
  if (!result.tls.ok) {
    result.notes.push(`TLS failed: ${result.tls.error}`);
    return result;
  }

  result.chain = await statusChain(`https://${entry.host}/`);
  const last = result.chain.at(-1);
  if (last?.error) {
    result.notes.push(`HTTP failed: ${last.error}`);
    return result;
  }

  const redirected = result.chain.length > 1;
  const finalHost = hostOf(last.url);

  if (entry.expectRedirect) {
    result.ok = redirected && finalHost === ROOT;
    if (!result.ok) result.notes.push(`Expected a redirect to ${ROOT}, ended at ${finalHost} (${last.status}).`);
    return result;
  }

  if (entry.mustNotRedirectToRoot && finalHost === ROOT && entry.host !== ROOT) {
    const chainText = result.chain
      .map((hop) => `${hop.status ?? "ERR"} ${hop.url}${hop.location ? ` -> ${hop.location}` : ""}`)
      .join("\n        ");
    result.notes.push(
      `${entry.host} is an alias: it redirects to ${ROOT} instead of serving the app surface.\n        ${chainText}`,
    );
    if (!ALLOW_APP_ALIAS) return result;
    result.notes.push("(--allow-app-alias: not failing the build on this)");
  }

  if (last.status !== 200) {
    result.notes.push(`Final status ${last.status} at ${last.url}.`);
    return result;
  }
  if (!/gradr/i.test(last.body ?? "")) {
    result.notes.push("Served HTML is not the Gradr bundle.");
    return result;
  }

  result.ok = true;
  return result;
}

const results = [];
for (const entry of HOSTS) results.push(await check(entry));

if (AS_JSON) {
  console.log(JSON.stringify(results, null, 2));
} else {
  for (const r of results) {
    const chain = r.chain.map((hop) => `${hop.status ?? "ERR"}`).join(" → ") || "-";
    const label = r.ok ? "PASS" : r.optional ? "PEND" : "FAIL";
    console.log(`${label.padEnd(4)} ${r.host.padEnd(22)} ${chain.padEnd(18)} tls:${r.tls?.ok ? "ok" : "fail"}`);
    for (const note of r.notes) console.log(`      ${note}`);
  }
}

const failed = results.filter((r) => !r.ok && !r.optional);
const pending = results.filter((r) => !r.ok && r.optional);
if (pending.length > 0) {
  console.log(`${pending.length} hostname(s) pending deployment by another project: ${pending.map((r) => r.host).join(", ")}`);
}
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} hostnames healthy.`);
process.exit(failed.length ? 1 : 0);
