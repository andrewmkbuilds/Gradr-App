/**
 * Shared mapping from raw Supabase auth errors to short, human copy.
 * Used by the sign-in/sign-up form, forgot-password and the verify-email gate
 * so the wording stays identical everywhere.
 */
import { z } from "zod";

export const emailSchema = z
  .string()
  .trim()
  .min(1, { message: "Enter your email address." })
  .email({ message: "Enter a valid email address." })
  .max(255, { message: "That email is too long." });

export function friendlyAuthError(raw: string): string {
  const m = (raw || "").toLowerCase();
  if (m.includes("already registered") || m.includes("already been registered") || m.includes("user already exists"))
    return "That email already has an account. Try signing in instead.";
  if (m.includes("email address") && m.includes("invalid")) return "Enter a valid email address.";
  if (m.includes("password should be at least")) return "Password must be at least 6 characters.";
  if (m.includes("weak password") || m.includes("pwned") || m.includes("compromised"))
    return "That password is too weak. Pick something longer and less common.";
  if (m.includes("invalid login credentials")) return "Incorrect email or password.";
  if (m.includes("email not confirmed")) return "Confirm your email first — check your inbox for the link.";
  if (m.includes("rate limit") || m.includes("too many")) return "Too many attempts. Wait a minute and try again.";
  if (m.includes("signups not allowed") || m.includes("signup is disabled"))
    return "New signups are currently disabled.";
  if (m.includes("for security purposes")) return "Please wait a moment before requesting another email.";
  if (m.includes("failed to fetch") || m.includes("network"))
    return "Network error — check your connection and try again.";
  return raw || "Something went wrong. Try again.";
}
