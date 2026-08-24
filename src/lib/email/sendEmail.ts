import { supabase } from "@/integrations/supabase/client";

/**
 * Templates a signed-in user is allowed to trigger for themselves. This list is
 * mirrored (and enforced) server-side in `send-transactional-email`; keeping it
 * here just gives us type safety and avoids pointless round trips.
 */
export type UserEmailTemplate =
  | "welcome"
  | "resume-analysis"
  | "ats-score-update"
  | "interview-completed"
  | "interview-report"
  | "career-plan"
  | "application-followup"
  | "job-match"
  | "verification-submitted";

/**
 * Fire-and-forget product email for the current user.
 *
 * The recipient is always resolved from the caller's session server-side, so
 * nothing here can be pointed at another person's inbox. Errors are logged and
 * never surfaced: a missed notification must not fail the user's action.
 */
export async function sendUserEmail(
  templateName: UserEmailTemplate,
  options: { idempotencyKey: string; templateData?: Record<string, unknown> },
): Promise<void> {
  try {
    const { error } = await supabase.functions.invoke("send-transactional-email", {
      body: {
        templateName,
        idempotencyKey: options.idempotencyKey,
        templateData: options.templateData ?? {},
      },
    });
    if (error) console.warn(`[email] ${templateName} failed`, error.message);
  } catch (err) {
    console.warn(`[email] ${templateName} threw`, err);
  }
}

/** First name for greetings, derived from profile metadata or the address. */
export function firstNameFrom(
  fullName?: string | null,
  email?: string | null,
): string | undefined {
  const fromName = fullName?.trim().split(/\s+/)[0];
  if (fromName) return fromName;
  const local = email?.split("@")[0];
  if (!local) return undefined;
  const cleaned = local.replace(/[._-]+/g, " ").trim().split(" ")[0];
  return cleaned ? cleaned.charAt(0).toUpperCase() + cleaned.slice(1) : undefined;
}
