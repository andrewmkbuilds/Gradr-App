import { initializePaddle as loadPaddle, type Paddle } from "@paddle/paddle-js";
import { supabase } from "@/integrations/supabase/client";

/**
 * Paddle client bootstrap.
 *
 * Config is validated, but validation NEVER throws during module import or
 * render — payments are an optional integration and a missing/mismatched env
 * var must not take the whole app down. Reads (`getPaddleEnvironment`) degrade
 * gracefully; only actions that genuinely need Paddle (`getPaddle`) throw, and
 * they throw inside an event handler where the UI can show an error.
 *
 * Only the client-side token (`test_...` / `live_...`) ever reaches the
 * browser. The server-side API key lives exclusively in edge functions.
 */
const clientToken = import.meta.env.VITE_PAYMENTS_CLIENT_TOKEN as string | undefined;
const configuredEnv = import.meta.env.VITE_PAYMENTS_ENVIRONMENT as string | undefined;

export type PaddleEnv = "sandbox" | "live";

/** Internal sentinel for "we could not determine the country" — never sent to Paddle. */
export const UNKNOWN_COUNTRY = "OTHERS";

interface ConfigResult {
  ok: boolean;
  token?: string;
  env?: PaddleEnv;
  reason?: string;
}

function resolveConfig(): ConfigResult {
  if (!clientToken) {
    return { ok: false, reason: "VITE_PAYMENTS_CLIENT_TOKEN is not set." };
  }
  const tokenEnv: PaddleEnv = clientToken.startsWith("test_") ? "sandbox" : "live";

  if (!configuredEnv) {
    return {
      ok: false,
      reason:
        "VITE_PAYMENTS_ENVIRONMENT is not set. Set it to 'sandbox' or 'live' — the payment environment is never defaulted.",
    };
  }
  if (configuredEnv !== "sandbox" && configuredEnv !== "live") {
    return { ok: false, reason: `VITE_PAYMENTS_ENVIRONMENT must be 'sandbox' or 'live', got '${configuredEnv}'.` };
  }
  if (tokenEnv !== configuredEnv) {
    return {
      ok: false,
      reason: `Paddle config mismatch: VITE_PAYMENTS_ENVIRONMENT is '${configuredEnv}' but the client token is a '${tokenEnv}' token.`,
    };
  }
  return { ok: true, token: clientToken, env: configuredEnv };
}

const config = resolveConfig();

if (!config.ok) {
  // Loud in the console, silent in the UI — checkout surfaces the error when used.
  console.error(`[payments] disabled: ${config.reason}`);
}

/** True when payments are usable. Gate any payment UI on this. */
export function isPaymentsConfigured(): boolean {
  return config.ok;
}

/** Why payments are unavailable, or null when everything is configured. */
export function getPaymentsConfigError(): string | null {
  return config.ok ? null : (config.reason ?? "Payments are not configured.");
}

/**
 * Environment used for entitlement/subscription reads. Never throws.
 * With no valid config it falls back to the token prefix, then to 'live' —
 * the safe default, since live is the stricter set of records to read.
 */
export function getPaddleEnvironment(): PaddleEnv {
  if (config.ok && config.env) return config.env;
  if (clientToken?.startsWith("test_")) return "sandbox";
  if (configuredEnv === "sandbox" || configuredEnv === "live") return configuredEnv;
  return "live";
}

/** Throws when payments are misconfigured — only call from user actions. */
function requireConfig(): { token: string; env: PaddleEnv } {
  if (!config.ok || !config.token || !config.env) {
    throw new Error(`Payments are unavailable: ${config.reason ?? "not configured"}`);
  }
  return { token: config.token, env: config.env };
}


let paddlePromise: Promise<Paddle> | null = null;

export async function getPaddle(): Promise<Paddle> {
  if (!paddlePromise) {
    const { token, env } = requireConfig();
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
