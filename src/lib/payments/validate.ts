/**
 * Runtime payment configuration validator.
 *
 * `diagnosePaymentsConfig` answers "can Paddle.js initialize?". That is not the
 * same question as "is this build safe to take money with?" — a bundle can be
 * perfectly initializable while pointing at the wrong catalog (a live token
 * with a stale `VITE_PAYMENTS_ENVIRONMENT=sandbox`, or the reverse on the
 * published build). Historically that only ever surfaced as plan changes being
 * silently disabled, which tells the user nothing.
 *
 * This module turns every detectable configuration fault into a precise,
 * user-facing statement plus ordered remediation steps. Pure and synchronous so
 * it can be unit tested and rendered during the first paint.
 */
import {
  currentPaymentsDiagnostics,
  type PaddleEnvName,
  type PaymentsDiagnostics,
} from "@/lib/paymentsConfig";

export type PaymentsValidationSeverity = "ok" | "warning" | "error";

export type PaymentsValidationCode =
  | "ok"
  | "missing_token"
  | "invalid_environment"
  | "environment_mismatch";

export interface PaymentsValidation {
  severity: PaymentsValidationSeverity;
  code: PaymentsValidationCode;
  /** One-line headline shown to the user. */
  title: string;
  /** Plain-language explanation of the actual consequence. */
  detail: string;
  /** Ordered remediation steps. Always at least one when not `ok`. */
  steps: string[];
  /** True when checkout genuinely cannot open. */
  blocksCheckout: boolean;
  /** Environment checkout will really use, when one can be determined. */
  effectiveEnvironment?: PaddleEnvName;
}

const REBUILD_STEP =
  "Rebuild and republish — Vite inlines VITE_* values at build time, so editing them without a new build changes nothing.";

export function validatePaymentsConfig(diag: PaymentsDiagnostics): PaymentsValidation {
  if (!diag.tokenEnvironment) {
    return {
      severity: "error",
      code: "missing_token",
      title: "Payments are not configured in this build.",
      detail:
        "No Paddle client-side token was inlined, so Paddle.js cannot initialize and no plan change or purchase can be started.",
      steps: [
        "Set VITE_PAYMENTS_CLIENT_TOKEN to your Paddle client-side token (test_… for sandbox, live_… for production).",
        REBUILD_STEP,
      ],
      blocksCheckout: true,
    };
  }

  const invalidEnv = diag.issues.find((i) => i.variable === "VITE_PAYMENTS_ENVIRONMENT");
  if (invalidEnv) {
    return {
      severity: "error",
      code: "invalid_environment",
      title: "The Paddle environment variable is invalid.",
      detail: invalidEnv.message,
      steps: [invalidEnv.fix, REBUILD_STEP],
      blocksCheckout: true,
      effectiveEnvironment: diag.tokenEnvironment,
    };
  }

  const mismatch = diag.warnings.find((w) => w.variable === "VITE_PAYMENTS_ENVIRONMENT");
  if (mismatch) {
    const real = diag.tokenEnvironment;
    return {
      severity: "warning",
      code: "environment_mismatch",
      title: `Payments environment mismatch — this build charges through Paddle ${real}.`,
      detail:
        `The inlined client token is a ${real} token, but VITE_PAYMENTS_ENVIRONMENT says ` +
        `'${mismatch.message.match(/is '([^']+)'/)?.[1] ?? "something else"}'. ` +
        `The token prefix always wins, so every checkout, price lookup and webhook for this build lands in the ${real} catalog` +
        (real === "live"
          ? " and moves real money."
          : " and no real money is taken, even in production."),
      steps: [
        `Set VITE_PAYMENTS_ENVIRONMENT to '${real}', or remove it entirely so the environment is derived from the token prefix.`,
        `Confirm the ${real} catalog contains every price id used by the pricing page (Admin → Payments debug runs this check).`,
        REBUILD_STEP,
      ],
      blocksCheckout: false,
      effectiveEnvironment: real,
    };
  }

  return {
    severity: "ok",
    code: "ok",
    title: `Payments configured for the Paddle ${diag.environment} environment.`,
    detail: "Token and environment agree; checkout can open.",
    steps: [],
    blocksCheckout: false,
    effectiveEnvironment: diag.environment,
  };
}

/** Validation for the bundle currently running in the browser. */
export function currentPaymentsValidation(): PaymentsValidation {
  return validatePaymentsConfig(currentPaymentsDiagnostics());
}
