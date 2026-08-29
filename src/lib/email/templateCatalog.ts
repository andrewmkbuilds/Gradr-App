/**
 * Browser-side mirror of the edge-function email classification
 * (`supabase/functions/_shared/transactional-email-templates/classification.ts`).
 *
 * Edge functions can't import from `src/`, so this file duplicates the table.
 * `src/test/emailMarketingGuard.test.ts` fails the build if the two ever drift.
 */

export type EmailKind = "transactional" | "marketing";

export type EmailCategory =
  | "essential"
  | "job_matches"
  | "application_reminders"
  | "product_insights";

export interface EmailTemplateInfo {
  name: string;
  kind: EmailKind;
  category: EmailCategory;
  trigger: string;
  /** Group used purely for display on the admin catalog. */
  group: "Account & security" | "Billing" | "Verification" | "Product notifications";
}

export const CATEGORY_LABELS: Record<EmailCategory, string> = {
  essential: "Essential",
  job_matches: "Job matches",
  application_reminders: "Application reminders",
  product_insights: "Resume & interview insights",
};

export const EMAIL_TEMPLATE_CATALOG: EmailTemplateInfo[] = [
  { name: "welcome", kind: "transactional", category: "essential", trigger: "Account created", group: "Account & security" },
  { name: "email-verification", kind: "transactional", category: "essential", trigger: "Address needs confirming", group: "Account & security" },
  { name: "password-reset", kind: "transactional", category: "essential", trigger: "Password reset requested", group: "Account & security" },
  { name: "sign-in-alert", kind: "transactional", category: "essential", trigger: "Sign-in from a new device", group: "Account & security" },
  { name: "security-alert", kind: "transactional", category: "essential", trigger: "Security event on the account", group: "Account & security" },
  { name: "student-verification-code", kind: "transactional", category: "essential", trigger: "Student verification code requested", group: "Account & security" },

  { name: "trial-started", kind: "transactional", category: "essential", trigger: "Free trial started", group: "Billing" },
  { name: "trial-ending", kind: "transactional", category: "essential", trigger: "Free trial ends soon — card will be charged", group: "Billing" },
  { name: "trial-cancelled", kind: "transactional", category: "essential", trigger: "Free trial cancelled before any charge", group: "Billing" },
  { name: "subscription-started", kind: "transactional", category: "essential", trigger: "Subscription started", group: "Billing" },
  { name: "subscription-upgraded", kind: "transactional", category: "essential", trigger: "Plan upgraded", group: "Billing" },
  { name: "subscription-downgraded", kind: "transactional", category: "essential", trigger: "Plan downgraded", group: "Billing" },
  { name: "subscription-cancelled", kind: "transactional", category: "essential", trigger: "Subscription cancelled", group: "Billing" },
  { name: "payment-successful", kind: "transactional", category: "essential", trigger: "Payment taken", group: "Billing" },
  { name: "payment-failed", kind: "transactional", category: "essential", trigger: "Payment declined", group: "Billing" },
  { name: "payment-retry", kind: "transactional", category: "essential", trigger: "Payment retry scheduled", group: "Billing" },
  { name: "payment-refunded", kind: "transactional", category: "essential", trigger: "Refund issued", group: "Billing" },
  { name: "invoice-receipt", kind: "transactional", category: "essential", trigger: "Receipt for a charge", group: "Billing" },

  { name: "verification-submitted", kind: "transactional", category: "essential", trigger: "Verification request received", group: "Verification" },
  { name: "verification-approved", kind: "transactional", category: "essential", trigger: "Verification approved", group: "Verification" },
  { name: "verification-rejected", kind: "transactional", category: "essential", trigger: "Verification rejected", group: "Verification" },
  { name: "verification-needs-info", kind: "transactional", category: "essential", trigger: "Verification needs more information", group: "Verification" },

  { name: "job-match", kind: "transactional", category: "job_matches", trigger: "A saved search matched a new role", group: "Product notifications" },
  { name: "application-followup", kind: "transactional", category: "application_reminders", trigger: "A follow-up the user scheduled is due", group: "Product notifications" },
  { name: "resume-analysis", kind: "transactional", category: "product_insights", trigger: "A resume the user uploaded finished analysis", group: "Product notifications" },
  { name: "ats-score-update", kind: "transactional", category: "product_insights", trigger: "An ATS score the user requested changed", group: "Product notifications" },
  { name: "interview-completed", kind: "transactional", category: "product_insights", trigger: "A mock interview the user ran finished", group: "Product notifications" },
  { name: "interview-report", kind: "transactional", category: "product_insights", trigger: "An interview report finished generating", group: "Product notifications" },
  { name: "career-plan", kind: "transactional", category: "product_insights", trigger: "A career plan the user requested is ready", group: "Product notifications" },
];

export const TEMPLATE_INFO_BY_NAME: Record<string, EmailTemplateInfo> = Object.fromEntries(
  EMAIL_TEMPLATE_CATALOG.map((t) => [t.name, t]),
);
