#!/usr/bin/env node
/**
 * Production HTTP assertion: app.gradr.me must SERVE the app, not redirect.
 *
 * Two URLs decide whether the authenticated product is reachable at all:
 *
 *   https://app.gradr.me/                  — the app root (post-login landing)
 *   https://app.gradr.me/~oauth/callback   — the exact Google redirect_uri
 *
 * Both must answer 200 with a real HTML document. A 301/302 whose Location
 * lands on gradr.me means hosting is treating app.gradr.me as an alias of the
 * primary domain: Google's callback would be bounced off the origin it was
 * issued for, and every post-login landing would leave the app surface.
 *
 * This check is deliberately strict about the FIRST hop as well as the final
 * one — a 200 reached only after a detour through the apex is still a broken
 * OAuth callback, because the authorization code is dropped on the redirect.
 *
 * Usage:
 *   node scripts/check-app-serving.mjs [--host app.gradr.me] [--json] [--warn-only]
 *
 * Exit code 0 = app.gradr.me is served independently. 1 = it is not (unless
 * --warn-only, which reports without failing the job).
 */

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};

const HOST = flag("--host", "app.gradr.me");
const ROOT_DOMAIN = "gradr.me";
const AS_JSON = args.includes("--json");
const WARN_ONLY = args.includes("--warn-only");
const MAX_HOPS = 5;
/** Below this, the response is a stub or an error page rather than the app. */
const MIN_BODY_BYTES = 500;

/** The managed OAuth broker legitimately terminates the callback path. */
const OAUTH_BROKER_HOST = "oauth.lovable.app";

const TARGETS = [
  { path: "/", label: "app root", expect: "document" },
  {
    path: "/~oauth/callback",
    label: "Google OAuth callback",
    // The callback is handled by the managed broker, so a hop to
    // oauth.lovable.app is correct — what must never happen is a hop to the
    // apex, which would strip the app origin the code was issued for. A bare
    // probe carries no `code`, so the broker answers 400: that still proves
    // the URL is reachable from the app host.
    expect: "broker",
    allowRedirectHosts: [OAUTH_BROKER_HOST],
    allowStatuses: [200, 400, 401],
  },
];

function hostOf(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

/** Follow redirects manually so every hop is inspectable. */
async function trace(url) {
  const hops = [];
  let current = url;

  for (let i = 0; i < MAX_HOPS; i += 1) {
    let response;
    try {
      response = await fetch(current, {
        redirect: "manual",
        headers: { "user-agent": "gradr-app-serving-check", accept: "text/html" },
      });
    } catch (error) {
      hops.push({ url: current, error: error instanceof Error ? error.message : String(error) });
      return { hops, final: null };
    }

    const location = response.headers.get("location");
    const redirect = response.status >= 300 && response.status < 400 && location;
    const absolute = redirect ? new URL(location, current).toString() : null;

    hops.push({
      url: current,
      status: response.status,
      location: absolute,
      contentType: response.headers.get("content-type"),
    });

    if (!redirect) {
      const body = await response.text().catch(() => "");
      return {
        hops,
        final: {
          url: current,
          status: response.status,
          bytes: body.length,
          html: /<html[\s>]/i.test(body),
        },
      };
    }

    current = absolute;
  }

  hops.push({ url: current, error: "Too many redirects" });
  return { hops, final: null };
}

async function checkTarget({ path, label }) {
  const url = `https://${HOST}${path}`;
  const { hops, final } = await trace(url);
  const failures = [];

  const transportError = hops.find((h) => h.error);
  if (transportError) failures.push(`request failed: ${transportError.error}`);

  // Any hop that redirects off the app host onto the apex is the failure mode
  // this check exists for. Report it explicitly, not as a generic non-200.
  for (const hop of hops) {
    if (!hop.location) continue;
    const target = hostOf(hop.location);
    const crossesToRoot = target === ROOT_DOMAIN || target === `www.${ROOT_DOMAIN}`;
    if (crossesToRoot && HOST !== ROOT_DOMAIN) {
      failures.push(
        `${hop.status} redirect to ${ROOT_DOMAIN} (${hop.url} -> ${hop.location}) — ` +
          `app.${ROOT_DOMAIN} is an alias of the primary domain, not a served host`,
      );
    } else if ([301, 302, 307, 308].includes(hop.status)) {
      failures.push(`unexpected ${hop.status} redirect: ${hop.url} -> ${hop.location}`);
    }
  }

  if (final) {
    if (final.status !== 200) failures.push(`expected 200, got ${final.status}`);
    if (final.bytes < MIN_BODY_BYTES) {
      failures.push(`response body is ${final.bytes} bytes — expected a rendered document`);
    }
    if (!final.html) failures.push("response is not an HTML document");
    if (hostOf(final.url) !== HOST) {
      failures.push(`served from ${hostOf(final.url)}, expected ${HOST}`);
    }
  }

  return { label, url, hops, final, failures, ok: failures.length === 0 };
}

const results = [];
for (const target of TARGETS) {
  results.push(await checkTarget(target));
}

const failed = results.filter((r) => !r.ok);

if (AS_JSON) {
  console.log(JSON.stringify({ host: HOST, ok: failed.length === 0, results }, null, 2));
} else {
  console.log(`Checking that ${HOST} serves the app directly\n`);
  for (const r of results) {
    console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.label} — ${r.url}`);
    for (const hop of r.hops) {
      const arrow = hop.location ? ` -> ${hop.location}` : "";
      console.log(`        ${hop.status ?? "ERR"} ${hop.url}${arrow}${hop.error ? ` (${hop.error})` : ""}`);
    }
    if (r.final?.status === 200) {
      console.log(`        body: ${r.final.bytes} bytes, html: ${r.final.html}`);
    }
    for (const reason of r.failures) console.log(`        ✗ ${reason}`);
    console.log("");
  }
  console.log(`${results.length - failed.length}/${results.length} checks passed on ${HOST}.`);
  if (failed.length) {
    console.log(
      `\nFix: ${HOST} must be the PRIMARY custom domain of the deployment that serves it.\n` +
        `Hosting redirects every non-primary domain to the primary one, so ${HOST} has to\n` +
        `belong to its own project (see docs/subdomain-deployment.md).`,
    );
  }
}

if (failed.length && !WARN_ONLY) process.exit(1);
