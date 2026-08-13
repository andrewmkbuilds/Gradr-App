import { corsHeaders } from "./shared/cors";
import { gatewayFetch, type PaddleEnv } from "./shared/paddle";

/**
 * Price ID resolver.
 *
 * The Paddle gateway occasionally answers with a plain-text upstream error, a
 * 5xx, or a 429. None of those may ever reach the browser as an unhandled
 * crash: this handler always returns a stable JSON envelope
 * (`{ error, code, retryable }`) so the pricing page can degrade to a
 * "prices unavailable" state instead of breaking.
 */

const RETRY_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 3;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface GatewayAttempt {
  status: number;
  raw: string;
  data: unknown;
  networkError: string | null;
}

async function fetchPriceOnce(environment: PaddleEnv, priceId: string): Promise<GatewayAttempt> {
  try {
    const res = await gatewayFetch(
      environment,
      `/prices?external_id=${encodeURIComponent(priceId)}`,
    );
    const raw = await res.text();
    let data: unknown = null;
    try {
      data = raw ? JSON.parse(raw) : null;
    } catch {
      data = null;
    }
    return { status: res.status, raw, data, networkError: null };
  } catch (err) {
    return {
      status: 0,
      raw: "",
      data: null,
      networkError: err instanceof Error ? err.message : String(err),
    };
  }
}

export const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const body = await req.json().catch(() => ({}));
    const priceId = typeof body?.priceId === "string" ? body.priceId : "";
    const environment: PaddleEnv = body?.environment === "live" ? "live" : "sandbox";
    if (!priceId || priceId.length > 64) {
      return json({ error: "Invalid priceId", code: "invalid_request", retryable: false }, 400);
    }

    let last: GatewayAttempt | null = null;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      last = await fetchPriceOnce(environment, priceId);

      // Success path: 2xx with a JSON body we can read.
      if (!last.networkError && last.status >= 200 && last.status < 300 && last.data !== null) {
        const paddleId = (last.data as { data?: Array<{ id?: string }> })?.data?.[0]?.id;
        if (!paddleId) {
          return json({ error: "Price not found", code: "price_not_found", retryable: false }, 404);
        }
        return json({ paddleId });
      }

      const retryable =
        Boolean(last.networkError) ||
        RETRY_STATUSES.has(last.status) ||
        // 2xx with a non-JSON body is an upstream hiccup — worth one more try.
        (last.status >= 200 && last.status < 300 && last.data === null);

      if (!retryable || attempt === MAX_ATTEMPTS) break;
      // Exponential backoff with a little jitter: 200ms, 400ms.
      await sleep(200 * 2 ** (attempt - 1) + Math.floor(Math.random() * 100));
    }

    console.error(
      "get-paddle-price gateway error",
      last?.status,
      last?.networkError ?? last?.raw.slice(0, 300),
    );

    // Client errors from the gateway are not going to fix themselves.
    if (last && last.status >= 400 && last.status < 500 && last.status !== 429) {
      return json(
        { error: "Price service rejected the request", code: "gateway_rejected", retryable: false },
        502,
      );
    }

    return json(
      { error: "Price service unavailable", code: "gateway_unavailable", retryable: true },
      502,
    );
  } catch (err) {
    console.error("get-paddle-price error", err);
    return json(
      { error: "Unable to resolve price", code: "internal_error", retryable: true },
      500,
    );
  }
};
