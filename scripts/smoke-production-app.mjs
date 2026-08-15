#!/usr/bin/env node
/**
 * Production smoke test for the app surface.
 *
 * Hard-refreshes the deep product routes on https://app.gradr.me and fails if
 * any of them leaves the app hostname — a redirect to gradr.me means the
 * authenticated surface is being aliased away and deep links are lost.
 *
 * Usage: node scripts/smoke-production-app.mjs [--host app.gradr.me] [--json]
 */
const args = process.argv.slice(2);
const hostArg = args.indexOf("--host");
const HOST = hostArg >= 0 ? args[hostArg + 1] : "app.gradr.me";
const ROOT = "gradr.me";
const PATHS = ["/dashboard", "/auth", "/career"];

async function chainFor(url, maxHops = 6) {
  const chain = [];
  let current = url;
  for (let i = 0; i < maxHops; i += 1) {
    let response;
    try {
      response = await fetch(current, { redirect: "manual", headers: { "user-agent": "gradr-smoke" } });
    } catch (error) {
      chain.push({ url: current, error: error instanceof Error ? error.message : String(error) });
      return chain;
    }
    const location = response.headers.get("location");
    chain.push({ url: current, status: response.status, location: location ?? null });
    if (response.status < 300 || response.status >= 400 || !location) return chain;
    current = new URL(location, current).toString();
  }
  chain.push({ url: current, error: "Too many redirects" });
  return chain;
}

const results = [];
for (const path of PATHS) {
  const chain = await chainFor(`https://${HOST}${path}`);
  const last = chain.at(-1);
  const finalHost = last?.url ? new URL(last.url).hostname : "";
  const crossed = finalHost === ROOT && HOST !== ROOT;
  results.push({
    path,
    chain,
    finalHost,
    crossed,
    ok: !last?.error && !crossed && last?.status === 200,
  });
}

if (args.includes("--json")) {
  console.log(JSON.stringify(results, null, 2));
} else {
  for (const r of results) {
    console.log(`${(r.ok ? "PASS" : "FAIL").padEnd(4)} ${HOST}${r.path}`);
    for (const hop of r.chain) {
      console.log(`      ${hop.status ?? "ERR"} ${hop.url}${hop.location ? ` -> ${hop.location}` : ""}${hop.error ? ` (${hop.error})` : ""}`);
    }
    if (r.crossed) console.log(`      Cross-surface redirect: ended on ${ROOT}, expected ${HOST}.`);
  }
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} app routes served from ${HOST}.`);
process.exit(failed.length ? 1 : 0);
