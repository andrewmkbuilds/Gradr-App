import type { Plugin } from "vite";

/**
 * Emits `/payments-build.json` describing the Paddle configuration that was
 * *inlined into this bundle*.
 *
 * Why a static file and not just `import.meta.env`: the whole class of failures
 * we keep hitting is "preview and production were built with different tokens".
 * A running bundle can only introspect itself, so the admin page needs a
 * machine-readable manifest it can fetch from the *other* surface to compare.
 *
 * The full client token is never written — only its type (`test` / `live`) and
 * a masked preview. CI also reads this file to fail a deploy whose checkout
 * entrypoint is disabled or misconfigured.
 */
export interface PaymentsBuildManifest {
  /** Manifest schema version, so consumers can reject shapes they don't know. */
  version: 1;
  /** Vite mode the bundle was built in. */
  mode: string;
  /** Which Paddle catalog the inlined token belongs to. */
  tokenType: "test" | "live" | "none";
  /** Masked token, e.g. `live_a1b2…f9c3`. Never the full value. */
  tokenPreview: string | null;
  /** Raw VITE_PAYMENTS_ENVIRONMENT as inlined (null when unset). */
  environmentVar: string | null;
  /** Environment actually used at runtime — token prefix wins. */
  resolvedEnvironment: "sandbox" | "live" | null;
  /** True when the env var disagrees with the token prefix. */
  mismatch: boolean;
  /** True when Paddle.js can initialize in this build. */
  checkoutEnabled: boolean;
  builtAt: string;
}

function mask(token: string): string {
  if (token.length <= 12) return `${token.slice(0, 4)}…`;
  return `${token.slice(0, 9)}…${token.slice(-4)}`;
}

export function buildPaymentsManifest(
  env: Record<string, string | undefined>,
  mode: string,
): PaymentsBuildManifest {
  const token = env.VITE_PAYMENTS_CLIENT_TOKEN?.trim() || "";
  const environmentVar = env.VITE_PAYMENTS_ENVIRONMENT?.trim() || null;

  const tokenType: PaymentsBuildManifest["tokenType"] = !token
    ? "none"
    : token.startsWith("test_")
      ? "test"
      : "live";
  const resolvedEnvironment =
    tokenType === "test" ? "sandbox" : tokenType === "live" ? "live" : null;
  const mismatch =
    !!resolvedEnvironment && !!environmentVar && environmentVar !== resolvedEnvironment;

  return {
    version: 1,
    mode,
    tokenType,
    tokenPreview: token ? mask(token) : null,
    environmentVar,
    resolvedEnvironment,
    mismatch,
    checkoutEnabled: tokenType !== "none",
    builtAt: new Date().toISOString(),
  };
}

export function paymentsBuildManifest(): Plugin {
  let manifest: PaymentsBuildManifest;

  return {
    name: "gradr:payments-build-manifest",
    configResolved(config) {
      manifest = buildPaymentsManifest(
        config.env as Record<string, string | undefined>,
        config.mode,
      );
    },
    configureServer(server) {
      // Dev/preview surface serves the same shape from memory.
      server.middlewares.use("/payments-build.json", (_req, res) => {
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Cache-Control", "no-store");
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.end(JSON.stringify({ ...manifest, builtAt: new Date().toISOString() }, null, 2));
      });
    },
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "payments-build.json",
        source: JSON.stringify(manifest, null, 2),
      });
    },
  };
}
