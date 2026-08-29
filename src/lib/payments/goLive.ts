/**
 * Paddle go-live checklist.
 *
 * Everything Paddle requires before a *live* checkout can complete, expressed
 * as ordered steps with a single unambiguous next action each. Pure: the caller
 * supplies the runtime signals it already has (config validation, catalog
 * preflight, policy-page probe, build manifests) and gets back a rendered-ready
 * list, so the whole decision table is unit testable.
 */
import type { PaymentsPreflight } from "@/lib/payments/preflight";
import type { PaymentsValidation } from "@/lib/payments/validate";
import type { BuildManifestResult } from "@/lib/payments/buildManifest";

export type GoLiveState = "done" | "blocked" | "todo" | "pending";

export interface GoLiveAction {
  label: string;
  /** Internal route or external URL. */
  href: string;
  external?: boolean;
}

export interface GoLiveStep {
  id: string;
  title: string;
  /** What is true right now — never generic advice. */
  detail: string;
  state: GoLiveState;
  action?: GoLiveAction;
}

export interface GoLiveInput {
  validation: PaymentsValidation;
  /** Catalog preflight for the active environment; null while loading. */
  preflight: PaymentsPreflight | null;
  /** Public policy pages Paddle's readiness check crawls. */
  policies: { path: string; ok: boolean }[] | null;
  /** Manifests for preview + production builds. */
  builds: BuildManifestResult[] | null;
}

const PAYMENTS_TAB: GoLiveAction = {
  label: "Open Payments settings",
  href: "https://docs.lovable.dev/features/payments",
  external: true,
};

export function buildGoLiveChecklist(input: GoLiveInput): GoLiveStep[] {
  const { validation, preflight, policies, builds } = input;
  const env = validation.effectiveEnvironment;
  const steps: GoLiveStep[] = [];

  // 1. A token exists and agrees with the declared environment.
  steps.push({
    id: "config",
    title: "Client token and environment agree",
    detail:
      validation.code === "ok"
        ? validation.title
        : `${validation.title} ${validation.steps[0] ?? ""}`.trim(),
    state:
      validation.severity === "ok" ? "done" : validation.blocksCheckout ? "blocked" : "todo",
    action:
      validation.severity === "ok"
        ? undefined
        : { label: "Inspect build config", href: "/admin/payments-debug" },
  });

  // 2. The published build must carry the live token, not the sandbox one.
  const production = builds?.find((b) => b.surface === "production");
  const productionEnv = production?.manifest?.resolvedEnvironment ?? null;
  steps.push({
    id: "live-token",
    title: "Production build carries the live token",
    detail: !builds
      ? "Reading the published build manifest…"
      : !production?.manifest
        ? `Could not read the production manifest (${production?.error ?? "unreachable"}). Republish so /payments-build.json is served.`
        : productionEnv === "live"
          ? `The published build uses a live token (${production.manifest.tokenPreview}).`
          : `The published build still uses a ${productionEnv ?? "missing"} token — live checkout will never run for customers.`,
    state: !builds
      ? "pending"
      : productionEnv === "live"
        ? "done"
        : production?.manifest
          ? "blocked"
          : "todo",
    action: { label: "Compare builds", href: "/admin/payments-status#builds" },
  });

  // 3. Every catalog price must exist in the environment being charged.
  steps.push({
    id: "catalog",
    title: `Products and prices exist in the ${env ?? "active"} catalog`,
    detail: !preflight
      ? "Resolving the catalog…"
      : preflight.status === "ok"
        ? `All ${preflight.checked.length} price ids resolve.`
        : preflight.status === "disabled"
          ? "Skipped — payments are not configured in this build."
          : preflight.status === "error"
            ? `Resolver error: ${preflight.error ?? "unknown"}.`
            : `${preflight.missing.length} price id(s) missing: ${preflight.missing.join(", ")}.`,
    state: !preflight
      ? "pending"
      : preflight.status === "ok"
        ? "done"
        : preflight.status === "error"
          ? "todo"
          : "blocked",
    action: { label: "Run catalog preflight", href: "/admin/payments-debug" },
  });

  // 4. Readiness check: the three policy pages must be publicly reachable.
  const badPolicies = (policies ?? []).filter((p) => !p.ok);
  steps.push({
    id: "policies",
    title: "Terms, refund and privacy pages are public",
    detail: !policies
      ? "Checking policy pages…"
      : badPolicies.length === 0
        ? `All ${policies.length} policy pages return 200 without authentication.`
        : `Unreachable: ${badPolicies.map((p) => p.path).join(", ")}. Paddle's readiness check will fail.`,
    state: !policies ? "pending" : badPolicies.length === 0 ? "done" : "blocked",
    action: { label: "Review legal pages", href: "/admin/legal" },
  });

  // 5. Paddle-side verification — owned by Paddle, we can only report and link.
  steps.push({
    id: "verification",
    title: "Paddle account verified and approved",
    detail:
      productionEnv === "live"
        ? "Live checkout stays disabled with transaction_checkout_not_enabled until Paddle finishes seller verification. Complete the verification form and wait for approval."
        : "Required before any live transaction can be taken. Complete the verification form in the Payments settings.",
    state: "todo",
    action: PAYMENTS_TAB,
  });

  // 6. Webhooks must be delivering, otherwise entitlements never activate.
  steps.push({
    id: "webhooks",
    title: "Webhook deliveries are healthy",
    detail:
      "Subscriptions, trials and refunds only take effect through payments-webhook. Confirm recent deliveries succeeded for this environment.",
    state: "todo",
    action: { label: "Open webhook log", href: "/admin/webhook-logs" },
  });

  return steps;
}

export function goLiveProgress(steps: GoLiveStep[]): { done: number; total: number; blocked: number } {
  return {
    done: steps.filter((s) => s.state === "done").length,
    total: steps.length,
    blocked: steps.filter((s) => s.state === "blocked").length,
  };
}
