/**
 * Signup-time consent capture.
 *
 * Terms/Privacy acceptance is mandatory to create an account and is recorded
 * against the published document version by `accept_legal_document`. Marketing
 * (product news) consent is SEPARATE and optional — it is never bundled into
 * the mandatory acceptance, and defaults to off.
 *
 * OAuth signups leave the page before we can write anything, so the optional
 * choice is stashed in sessionStorage and applied on the first authenticated
 * render. Nothing here is required for the account to work: if the write
 * fails, the user simply keeps the default (no product emails).
 */
import { supabase } from "@/integrations/supabase/client";

const KEY = "gradr-signup-consent";

export interface SignupConsent {
  /** Optional opt-in to product news and tips. Defaults to false. */
  marketing: boolean;
  /** ISO timestamp of when the mandatory terms box was ticked. */
  acceptedAt: string;
}

export function stashSignupConsent(consent: SignupConsent) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(consent));
  } catch {
    /* private mode — the default (no marketing) applies */
  }
}

function readStash(): SignupConsent | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as SignupConsent) : null;
  } catch {
    return null;
  }
}

function clearStash() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Applies a stashed choice to the signed-in user's notification preferences.
 * Safe to call on every authenticated mount — it no-ops without a stash.
 */
export async function applyPendingSignupConsent(userId: string) {
  const consent = readStash();
  if (!consent) return;
  clearStash();
  try {
    await supabase
      .from("notification_preferences")
      .upsert(
        {
          user_id: userId,
          product_insights_email: consent.marketing,
          product_insights_in_app: consent.marketing,
        },
        { onConflict: "user_id" },
      );
  } catch {
    /* non-blocking: the stricter default already applies */
  }
}

/** Metadata attached to the auth user so the acceptance is auditable. */
export function signupConsentMetadata(consent: SignupConsent) {
  return {
    terms_accepted_at: consent.acceptedAt,
    marketing_opt_in: consent.marketing,
    marketing_opt_in_at: consent.marketing ? consent.acceptedAt : null,
  };
}
