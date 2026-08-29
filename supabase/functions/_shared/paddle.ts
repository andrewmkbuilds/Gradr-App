import { Environment, EventName, Paddle } from "npm:@paddle/paddle-node-sdk";

const getEnv = (key: string): string => {
  const value = Deno.env.get(key);
  if (!value) throw new Error(`${key} is not configured`);
  return value;
};

export { EventName };

export type PaddleEnv = "sandbox" | "live";

const GATEWAY_BASE_URL = "https://connector-gateway.lovable.dev/paddle";

export function getConnectionApiKey(env: PaddleEnv): string {
  return env === "sandbox" ? getEnv("PADDLE_SANDBOX_API_KEY") : getEnv("PADDLE_LIVE_API_KEY");
}

export function getPaddleClient(env: PaddleEnv): Paddle {
  const connectionApiKey = getConnectionApiKey(env);
  const lovableApiKey = getEnv("LOVABLE_API_KEY");

  return new Paddle(connectionApiKey, {
    environment: GATEWAY_BASE_URL as unknown as Environment,
    customHeaders: {
      "X-Connection-Api-Key": connectionApiKey,
      "Lovable-API-Key": lovableApiKey,
    },
  });
}

export async function gatewayFetch(env: PaddleEnv, path: string, init?: RequestInit): Promise<Response> {
  const connectionApiKey = getConnectionApiKey(env);
  const lovableApiKey = getEnv("LOVABLE_API_KEY");
  return fetch(`${GATEWAY_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-Connection-Api-Key": connectionApiKey,
      "Lovable-API-Key": lovableApiKey,
      ...init?.headers,
    },
  });
}

export function getWebhookSecret(env: PaddleEnv): string {
  return env === "sandbox"
    ? getEnv("PAYMENTS_SANDBOX_WEBHOOK_SECRET")
    : getEnv("PAYMENTS_LIVE_WEBHOOK_SECRET");
}

export async function verifyWebhook(req: Request, env: PaddleEnv) {
  const signature = req.headers.get("paddle-signature");
  const body = await req.text();
  const secret = getWebhookSecret(env);
  if (!signature || !body) throw new Error("Missing signature or body");

  const paddle = getPaddleClient(env);
  return await paddle.webhooks.unmarshal(body, secret, signature);
}

/** Human-readable price id -> plan tier + billing interval. */
export const PLAN_PRICES: Record<
  string,
  { tier: "starter" | "pro" | "advanced"; interval: "monthly" | "annual" }
> = {
  advanced_monthly: { tier: "advanced", interval: "monthly" },
  advanced_annual: { tier: "advanced", interval: "annual" },
  pro_monthly: { tier: "pro", interval: "monthly" },
  pro_annual: { tier: "pro", interval: "annual" },
  starter_monthly: { tier: "starter", interval: "monthly" },
  starter_annual: { tier: "starter", interval: "annual" },
};

/** Human-readable price id -> one-off credit grant. */
export const CREDIT_PACKS: Record<
  string,
  { label: string; credits: number; kind: "application" | "interview" }
> = {
  applications_10: { label: "10 Extra Applications", credits: 10, kind: "application" },
  applications_25: { label: "25 Extra Applications", credits: 25, kind: "application" },
  interview_pack_3: { label: "Interview Prep Pack (3 sessions)", credits: 3, kind: "interview" },
  interview_pack_10: { label: "Interview Prep Pack (10 sessions)", credits: 10, kind: "interview" },
};

/**
 * One-time thank-you credits for committing to a yearly plan. Granted once per
 * subscription (keyed on the Paddle subscription id) when an annual plan starts.
 */
export const ANNUAL_BONUS: Record<
  "starter" | "pro" | "advanced",
  { application: number; interview: number }
> = {
  starter: { application: 10, interview: 3 },
  pro: { application: 25, interview: 6 },
  advanced: { application: 50, interview: 12 },
};

/**
 * Resolves a human-readable price id (`pro_monthly`) to a Paddle `pri_...` id.
 *
 * Paddle's `?external_id=` filter only matches `import_meta.external_id`, which
 * is set by catalog *imports*. Prices created through the Lovable catalog tools
 * carry their external id in `custom_data.external_id` instead, so the filter
 * silently returns an empty list for every price we own. Paging the catalog and
 * matching client-side is the only lookup that actually works; `import_meta` is
 * kept as a fallback so imported prices keep resolving too.
 */
export async function resolvePaddlePriceId(
  env: PaddleEnv,
  externalId: string,
): Promise<string | null> {
  let after: string | null = null;

  for (let page = 0; page < 10; page += 1) {
    const query = `/prices?per_page=200&status=active${after ? `&after=${encodeURIComponent(after)}` : ""}`;
    const res = await gatewayFetch(env, query);
    if (!res.ok) throw new Error(`paddle_catalog_${res.status}`);
    const body = await res.json();
    const rows: Array<{
      id?: string;
      custom_data?: { external_id?: string };
      import_meta?: { external_id?: string };
    }> = body?.data ?? [];

    for (const row of rows) {
      const rowExternalId = row?.custom_data?.external_id ?? row?.import_meta?.external_id;
      if (rowExternalId === externalId && row?.id) return row.id as string;
    }

    if (!body?.meta?.pagination?.has_more || rows.length === 0) break;
    after = rows[rows.length - 1]?.id ?? null;
    if (!after) break;
  }

  return null;
}
