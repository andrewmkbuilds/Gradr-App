/**
 * Age-confirmation gate.
 *
 * Gradr does not collect a date of birth and stores no under-age marker: the
 * gate is a single mandatory self-declaration shown only while an account is
 * being *created*. Everything else — signing in with an existing account,
 * returning through an OAuth callback, restoring a session — must never be
 * blocked by it.
 *
 * This module owns that decision so email/password and every OAuth provider
 * behave identically, and so each outcome is reported with the auth method
 * that produced it.
 */
import { track } from "@/lib/telemetry/events";
import type { SignupMethod } from "@/lib/telemetry/signup";

/** Minimum self-declared age required to create an account. */
export const MINIMUM_AGE = 13;

export type AgeGateOutcome = "eligible" | "ineligible" | "bypass";

/** Why the gate did not need to run. Only ever paired with `bypass`. */
export type AgeGateBypassReason = "existing_account_signin" | "oauth_callback" | "session_restored";

/**
 * True only when the current action creates a new account. Existing-user
 * sign-in — whichever method — returns false, so the gate cannot block it.
 */
export function ageGateApplies(input: { isSignUp: boolean }): boolean {
  return input.isSignUp === true;
}

export function trackAgeGateOutcome(
  outcome: AgeGateOutcome,
  method: SignupMethod,
  reason?: AgeGateBypassReason,
) {
  track("age_gate_result", {
    outcome,
    auth_method: method,
    minimum_age: MINIMUM_AGE,
    ...(reason ? { bypass_reason: reason } : {}),
  });
}
