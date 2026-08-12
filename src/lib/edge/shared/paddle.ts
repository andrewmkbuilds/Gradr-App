import { Environment, EventName, Paddle } from "@paddle/paddle-node-sdk";

const getEnv = (key: string): string => {
  const value = process.env[key];
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
