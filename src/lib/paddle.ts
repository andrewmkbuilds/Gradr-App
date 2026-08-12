import { initializePaddle as loadPaddle, type Paddle } from "@paddle/paddle-js";
import { supabase } from "@/integrations/supabase/client";

/**
 * Paddle client bootstrap.
 *
 * Both the environment and the client-side token come from env vars and are
 * validated loudly — running the wrong environment against the wrong Paddle
 * account is worse than not running at all.
 *
 * Only the client-side token (`test_...` / `live_...`) ever reaches the
 * browser. The server-side API key lives exclusively in edge functions.
 */
const clientToken = import.meta.env.VITE_PAYMENTS_CLIENT_TOKEN as string | undefined;
const configuredEnv = import.meta.env.VITE_PAYMENTS_ENVIRONMENT as string | undefined;

export type PaddleEnv = "sandbox" | "live";

/** Internal sentinel for "we could not determine the country" — never sent to Paddle. */
export const UNKNOWN_COUNTRY = "OTHERS";

function assertConfig(): { token: string; env: PaddleEnv } {
  if (!configuredEnv) {
    throw new Error(
      "VITE_PAYMENTS_ENVIRONMENT is not set. Set it to 'sandbox' or 'live' — the payment environment is never defaulted.",
    );
  }
  if (configuredEnv !== "sandbox" && configuredEnv !== "live") {
    throw new Error(`VITE_PAYMENTS_ENVIRONMENT must be 'sandbox' or 'live', got '${configuredEnv}'.`);
  }
  if (!clientToken) throw new Error("VITE_PAYMENTS_CLIENT_TOKEN is not set.");

  const tokenEnv: PaddleEnv = clientToken.startsWith("test_") ? "sandbox" : "live";
  if (tokenEnv !== configuredEnv) {
    throw new Error(
      `Paddle config mismatch: VITE_PAYMENTS_ENVIRONMENT is '${configuredEnv}' but the client token is a '${tokenEnv}' token.`,
    );
  }
  return { token: clientToken, env: configuredEnv };
}

/** Single source of truth for the payment environment. */
export function getPaddleEnvironment(): PaddleEnv {
  return assertConfig().env;
}

let paddlePromise: Promise<Paddle> | null = null;

export async function getPaddle(): Promise<Paddle> {
  if (!paddlePromise) {
    const { token, env } = assertConfig();
    paddlePromise = loadPaddle({
      environment: env === "sandbox" ? "sandbox" : "production",
      token,
    }).then((instance) => {
      if (!instance) throw new Error("Paddle.js failed to initialize");
      return instance;
    });
  }
  return paddlePromise;
}

/** Back-compat helper used by the billing provider. */
export async function initializePaddle() {
  await getPaddle();
}

/**
 * Country used for localized pricing.
 *
 * This app is a static SPA, so there is no request handler to read a
 * geo header like `x-vercel-ip-country`. If a CDN/edge injects one into the
 * document as `<meta name="x-geo-country" content="DE">`, we honour it;
 * otherwise we return undefined and let `Paddle.PricePreview()` geolocate the
 * visitor from their IP. The `OTHERS` sentinel stays app-side only.
 */
export function resolveCountryCode(): string | undefined {
  const meta = document
    .querySelector<HTMLMetaElement>('meta[name="x-geo-country"]')
    ?.content?.trim()
    .toUpperCase();
  if (!meta || meta === UNKNOWN_COUNTRY || meta.length !== 2) return undefined;
  return meta;
}

export interface PreviewedPrice {
  /** Localized, Paddle-formatted total. Render as-is — never re-format. */
  formattedTotal: string;
  currencyCode: string;
}

/**
 * Localized prices for a set of human-readable price IDs.
 * Returns a map keyed by the human-readable ID.
 */
export async function previewPrices(
  priceIds: string[],
): Promise<Record<string, PreviewedPrice>> {
  const paddle = await getPaddle();
  const resolved = await Promise.all(
    priceIds.map(async (id) => [id, await getPaddlePriceId(id)] as const),
  );
  const byPaddleId = new Map(resolved.map(([id, paddleId]) => [paddleId, id]));

  const country = resolveCountryCode();
  const result = await paddle.PricePreview({
    items: resolved.map(([, paddleId]) => ({ priceId: paddleId, quantity: 1 })),
    ...(country ? { address: { countryCode: country } } : {}),
  });

  const out: Record<string, PreviewedPrice> = {};
  for (const line of result.data.details.lineItems) {
    const key = byPaddleId.get(line.price.id);
    if (!key) continue;
    out[key] = {
      formattedTotal: line.formattedTotals.subtotal,
      currencyCode: result.data.currencyCode,
    };
  }
  return out;
}

const priceCache = new Map<string, string>();

export async function getPaddlePriceId(priceId: string): Promise<string> {
  const cached = priceCache.get(priceId);
  if (cached) return cached;

  const { data, error } = await supabase.functions.invoke("get-paddle-price", {
    body: { priceId, environment: getPaddleEnvironment() },
  });
  if (error || !data?.paddleId) throw new Error(`Failed to resolve price: ${priceId}`);
  priceCache.set(priceId, data.paddleId);
  return data.paddleId as string;
}
