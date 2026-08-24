import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { applyPendingSignupConsent } from "@/lib/consent/signupConsent";

/**
 * Applies the optional marketing choice made on the signup form once the user
 * is authenticated. OAuth signups leave the page mid-flow, so the choice is
 * stashed there and written here. Renders nothing.
 */
export function SignupConsentSync() {
  const { user } = useAuth();
  useEffect(() => {
    if (!user || user.is_anonymous === true) return;
    void applyPendingSignupConsent(user.id);
  }, [user]);
  return null;
}
