/**
 * Client for `/payments-build.json` — the per-build Paddle manifest emitted by
 * the `gradr:payments-build-manifest` Vite plugin.
 *
 * A running bundle can only introspect the token *it* was built with. The
 * expensive mistakes in this integration are cross-surface: preview built with
 * a live token, or production still carrying the sandbox one. Fetching the
 * manifest from both origins is the only way to see them side by side.
 */
import { PRODUCTION_ORIGIN } from "@/config/domains";
import { currentPaymentsDiagnostics } from "@/lib/paymentsConfig";

export interface PaymentsBuildManifest {
  version: number;
  mode: string;
  tokenType: "test" | "live" | "none";
  tokenPreview: string | null;
  environmentVar: string | null;
  resolvedEnvironment: "sandbox" | "live" | null;
  mismatch: boolean;
  checkoutEnabled: boolean;
  builtAt: string;
}

export type BuildSurface = "preview" | "production";

export interface BuildManifestResult {
  surface: BuildSurface;
  origin: string;
  manifest: PaymentsBuildManifest | null;
  /** Why the manifest could not be read (network, CORS, 404, bad shape). */
  error?: string;
}

function isManifest(value: unknown): value is PaymentsBuildManifest {
  const m = value as PaymentsBuildManifest | null;
  return !!m && typeof m === "object" && typeof m.tokenType === "string" && m.version === 1;
}

export async function fetchBuildManifest(
  surface: BuildSurface,
  origin: string,
): Promise<BuildManifestResult> {
  try {
    const res = await fetch(`${origin.replace(/\/$/, "")}/payments-build.json`, {
      cache: "no-store",
    });
    if (!res.ok) {
      return { surface, origin, manifest: null, error: `HTTP ${res.status}` };
    }
    const json: unknown = await res.json();
    if (!isManifest(json)) {
      return { surface, origin, manifest: null, error: "Unrecognised manifest shape" };
    }
    return { surface, origin, manifest: json };
  } catch (err) {
    // Cross-origin reads of the production manifest can be blocked; that is a
    // reportable state, never a thrown error that breaks the admin page.
    return {
      surface,
      origin,
      manifest: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Manifest describing the bundle currently executing, without a network hop. */
export function localBuildManifest(): PaymentsBuildManifest {
  const diag = currentPaymentsDiagnostics();
  return {
    version: 1,
    mode: import.meta.env.MODE,
    tokenType: diag.tokenEnvironment === "sandbox" ? "test" : diag.tokenEnvironment ? "live" : "none",
    tokenPreview: diag.tokenPreview ?? null,
    environmentVar: (import.meta.env.VITE_PAYMENTS_ENVIRONMENT as string | undefined) ?? null,
    resolvedEnvironment: diag.tokenEnvironment ?? null,
    mismatch: diag.warnings.some((w) => w.variable === "VITE_PAYMENTS_ENVIRONMENT"),
    checkoutEnabled: diag.ok,
    builtAt: "runtime",
  };
}

/** Reads both surfaces: this origin (preview/whatever is running) and production. */
export async function fetchBothBuildManifests(): Promise<BuildManifestResult[]> {
  const here = typeof window !== "undefined" ? window.location.origin : "";
  const production = PRODUCTION_ORIGIN.app;
  const isProductionOrigin = here === production;

  const [preview, prod] = await Promise.all([
    fetchBuildManifest("preview", here),
    isProductionOrigin
      ? Promise.resolve<BuildManifestResult>({
          surface: "production",
          origin: production,
          manifest: localBuildManifest(),
        })
      : fetchBuildManifest("production", production),
  ]);

  // Falling back to the in-bundle values keeps the "preview" row truthful even
  // when the static manifest is missing (older deploy, dev without the plugin).
  if (!preview.manifest) preview.manifest = localBuildManifest();
  return [preview, prod];
}

/** True when the two surfaces target different Paddle catalogs. */
export function surfacesDisagree(results: BuildManifestResult[]): boolean {
  const envs = results
    .map((r) => r.manifest?.resolvedEnvironment)
    .filter((e): e is "sandbox" | "live" => !!e);
  return new Set(envs).size > 1;
}
