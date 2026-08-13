import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

// --- Response hardening -------------------------------------------------
// Goal: remove unnecessary technology/version disclosure and add the
// privacy/isolation headers the app actually needs. We deliberately do NOT
// touch HSTS, Referrer-Policy, X-Content-Type-Options or caching — those are
// already correct and legitimate.

// Headers that leak stack/build details without any functional purpose.
const DISCLOSURE_HEADERS = [
  "x-powered-by",
  "x-aspnet-version",
  "x-aspnetmvc-version",
  "x-generator",
  "x-runtime",
  "x-version",
  "x-deployment-id",
  "x-nitro-prerender",
  "x-sveltekit-page",
];

// camera/microphone/display-capture stay enabled for the AI Mock Interview.
// `payment` is intentionally omitted so the Paddle checkout overlay keeps working.
const PERMISSIONS_POLICY = [
  "camera=(self)",
  "microphone=(self)",
  "display-capture=(self)",
  "geolocation=()",
  "usb=()",
  "serial=()",
  "bluetooth=()",
  "midi=()",
  "idle-detection=()",
  "browsing-topics=()",
].join(", ");

function harden(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const name of DISCLOSURE_HEADERS) headers.delete(name);

  if (!headers.has("permissions-policy")) {
    headers.set("permissions-policy", PERMISSIONS_POLICY);
  }
  if (!headers.has("x-frame-options")) headers.set("x-frame-options", "SAMEORIGIN");
  if (!headers.has("x-permitted-cross-domain-policies")) {
    headers.set("x-permitted-cross-domain-policies", "none");
  }
  // "allow-popups" is required: Google OAuth and Paddle open popup windows.
  if (!headers.has("cross-origin-opener-policy")) {
    headers.set("cross-origin-opener-policy", "same-origin-allow-popups");
  }

  // 101/204/205/304 must stay body-less; everything else reuses the original stream.
  const nullBody = [101, 204, 205, 304].includes(response.status);
  return new Response(nullBody ? null : response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return harden(await normalizeCatastrophicSsrResponse(response));
    } catch (error) {
      console.error(error);
      return harden(
        new Response(renderErrorPage(), {
          status: 500,
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
      );
    }
  },

};
