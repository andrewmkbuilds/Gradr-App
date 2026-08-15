#!/usr/bin/env node
/**
 * OAuth callback preflight.
 *
 * Single, narrow assertion: requesting
 *
 *   https://app.gradr.me/~oauth/callback
 *
 * must never redirect to the apex (gradr.me / www.gradr.me). A bounce to the
 * apex means hosting treats app.gradr.me as an alias, and Google's
 * authorization code is dropped when the browser leaves the origin the code
 * was issued for — sign-in fails with no recoverable state.
 *
 * Every hop in the chain is inspected, not just the final one: a 200 reached
 * *after* a detour through the apex is still a broken callback.
 *
 * Usage:
 *   node scripts/preflight-oauth-callback.mjs [--host app.gradr.me] [--json] [--warn-only]
 *
 * Exit 0 = no apex bounce. Exit 1 = the callback redirects to gradr.me.
 */

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};

const HOST = flag("--host", "app.gradr.me");
const CALLBACK_URL = `https://${HOST}/~oauth/callback`;
const APEX_HOSTS = new Set(["gradr.me", "www.gradr.me"]);
const MAX_HOPS = 6;
const AS_JSON = args.includes("--json");
const WARN_ONLY = args.includes("--warn-only");

const hostOf = (url) => {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
};

/** Walks the redirect chain manually so every intermediate hop is visible. */
async function trace(startUrl) {
  const hops = [];
  let url = startUrl;
  for (let i = 0; i < MAX_HOPS; i += 1) {
    let response;
    try {
      response = await fetch(url, { redirect: "manual", headers: { "user-agent": "gradr-oauth-preflight" } });
    } catch (error) {
      hops.push({ url, error: error.message });
      return hops;
    }
    const location = response.headers.get("location");
    const next = location ? new URL(location, url).toString() : null;
    hops.push({ url, status: response.status, location: next });
    if (!next || response.status < 300 || response.status >= 400) return hops;
    url = next;
  }
  hops.push({ url, error: `exceeded ${MAX_HOPS} redirects` });
  return hops;
}

const hops = await trace(CALLBACK_URL);
const apexBounce = hops.find((hop) => {
  const target = hop.location ? hostOf(hop.location) : null;
  return target ? APEX_HOSTS.has(target) : false;
});
const transportError = hops.find((hop) => hop.error);
const passed = !apexBounce && !transportError;

if (AS_JSON) {
  console.log(JSON.stringify({ url: CALLBACK_URL, passed, apexBounce: apexBounce ?? null, hops }, null, 2));
} else {
  console.log(`OAuth callback preflight — ${CALLBACK_URL}\n`);
  hops.forEach((hop, i) => {
    const detail = hop.error ? `ERROR ${hop.error}` : `${hop.status}${hop.location ? ` -> ${hop.location}` : ""}`;
    console.log(`  ${i + 1}. ${hop.url}\n     ${detail}`);
  });
  console.log("");
  if (apexBounce) {
    console.log(`FAIL: callback redirects to the apex (${apexBounce.location}).`);
    console.log("      app.gradr.me is being served as an alias of gradr.me. Set app.gradr.me");
    console.log("      as the Primary domain of the app project so the callback terminates on it.");
  } else if (transportError) {
    console.log(`FAIL: could not complete the request — ${transportError.error}`);
  } else {
    console.log("PASS: no redirect to gradr.me anywhere in the callback chain.");
  }
}

if (!passed && !WARN_ONLY) process.exit(1);
