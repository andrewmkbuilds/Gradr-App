/**
 * Lovable connector gateway helper.
 *
 * All connector-backed providers (Resend, Apify, Google Calendar, ...) are
 * called through the gateway so OAuth refresh and credential storage stay
 * server-side. Never call the provider API directly.
 */
const GATEWAY_ROOT = "https://connector-gateway.lovable.dev";

export class GatewayError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: string,
  ) {
    super(message);
    this.name = "GatewayError";
  }
}

function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

export function connectorConfigured(connectionKeyEnv: string): boolean {
  return Boolean(Deno.env.get("LOVABLE_API_KEY") && Deno.env.get(connectionKeyEnv));
}

export async function gatewayFetch(
  connectorId: string,
  connectionKeyEnv: string,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const lovableKey = requireEnv("LOVABLE_API_KEY");
  const connectionKey = requireEnv(connectionKeyEnv);

  const res = await fetch(`${GATEWAY_ROOT}/${connectorId}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": connectionKey,
      ...(init.headers as Record<string, string> | undefined),
    },
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(`[gateway:${connectorId}] ${init.method ?? "GET"} ${path} -> ${res.status}: ${body}`);
    throw new GatewayError(`${connectorId} request failed`, res.status, body);
  }
  return res;
}

export async function gatewayJson<T>(
  connectorId: string,
  connectionKeyEnv: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await gatewayFetch(connectorId, connectionKeyEnv, path, init);
  return (await res.json()) as T;
}
