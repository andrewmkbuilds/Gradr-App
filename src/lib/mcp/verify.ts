/**
 * Browser-side reachability probe for the app's MCP endpoint.
 *
 * The endpoint is OAuth-protected, so an unauthenticated probe SHOULD answer
 * `401` with a `WWW-Authenticate` header pointing at the protected-resource
 * metadata. That is the healthy signal — it proves the function is deployed,
 * CORS-reachable and correctly guarded. Anything else is a real problem.
 */
export type McpVerifyStatus = "ok" | "unprotected" | "unreachable" | "error";

export type McpVerifyResult = {
  status: McpVerifyStatus;
  /** Human-readable summary for the UI. */
  message: string;
  httpStatus?: number;
  /** Authorization server advertised by the resource metadata, when available. */
  authorizationServer?: string;
  resource?: string;
  checkedAt: string;
};

type Fetcher = typeof fetch;

async function readResourceMetadata(
  mcpUrl: string,
  doFetch: Fetcher,
): Promise<{ resource?: string; authorizationServer?: string }> {
  try {
    const url = new URL(mcpUrl);
    const metadataUrl = `${url.origin}/.well-known/oauth-protected-resource${url.pathname}`;
    const response = await doFetch(metadataUrl, { method: "GET" });
    if (!response.ok) return {};
    const body = (await response.json()) as {
      resource?: string;
      authorization_servers?: string[];
    };
    return {
      resource: typeof body.resource === "string" ? body.resource : undefined,
      authorizationServer: body.authorization_servers?.[0],
    };
  } catch {
    return {};
  }
}

export async function verifyMcpEndpoint(
  mcpUrl: string,
  options: { fetchImpl?: Fetcher; timeoutMs?: number } = {},
): Promise<McpVerifyResult> {
  const doFetch = options.fetchImpl ?? fetch;
  const checkedAt = new Date().toISOString();

  if (!mcpUrl) {
    return { status: "error", message: "No connection URL is configured for this environment.", checkedAt };
  }

  const controller = typeof AbortController !== "undefined" ? new AbortController() : undefined;
  const timer =
    controller && typeof window !== "undefined"
      ? window.setTimeout(() => controller.abort(), options.timeoutMs ?? 10_000)
      : undefined;

  try {
    const response = await doFetch(mcpUrl, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
      signal: controller?.signal,
    });

    const metadata = await readResourceMetadata(mcpUrl, doFetch);

    if (response.status === 401) {
      return {
        status: "ok",
        httpStatus: 401,
        message:
          "The connector endpoint is live and asking for sign-in — exactly what an assistant sees before you approve access.",
        checkedAt,
        ...metadata,
      };
    }

    if (response.status === 200) {
      return {
        status: "unprotected",
        httpStatus: 200,
        message: "The endpoint answered without asking for sign-in. Contact support before connecting.",
        checkedAt,
        ...metadata,
      };
    }

    if (response.status === 404) {
      return {
        status: "unreachable",
        httpStatus: 404,
        message: "Nothing is deployed at this URL (404). The connector URL may be wrong or out of date.",
        checkedAt,
        ...metadata,
      };
    }

    return {
      status: "error",
      httpStatus: response.status,
      message: `The endpoint answered with HTTP ${response.status}. Try again in a moment.`,
      checkedAt,
      ...metadata,
    };
  } catch {
    return {
      status: "unreachable",
      message:
        "Couldn't reach the endpoint from this browser. Check your network, VPN or extensions that block requests.",
      checkedAt,
    };
  } finally {
    if (timer !== undefined) window.clearTimeout(timer);
  }
}
