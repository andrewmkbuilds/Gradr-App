/**
 * Single source of truth for what each Gradr email *is*.
 *
 * Every registered template must appear here. The classification drives three
 * things:
 *   1. A hard block on marketing-shaped sends (`kind: 'marketing'` can never be
 *      queued — the send function refuses it).
 *   2. Per-user opt-outs for non-essential product notifications, resolved
 *      through the `email_category_allowed` database function.
 *   3. The admin catalog at /admin/email-templates.
 *
 * Gradr sends transactional email only. `kind: 'marketing'` exists purely so
 * the guard has something to assert against — no template may ever use it.
 */

export type EmailKind = 'transactional' | 'marketing'

/**
 * `essential` emails always send (auth, security, billing, verification
 * outcomes). Everything else maps to a preference column users control in
 * Settings -> Notifications.
 */
export type EmailCategory =
  | 'essential'
  | 'job_matches'
  | 'application_reminders'
  | 'product_insights'

export interface EmailClassification {
  kind: EmailKind
  category: EmailCategory
  /** Plain-language reason this email is allowed to exist. */
  trigger: string
}

export const EMAIL_CLASSIFICATIONS: Record<string, EmailClassification> = {
  // --- Account & security (essential) ---
  'welcome': { kind: 'transactional', category: 'essential', trigger: 'Account created' },
  'email-verification': { kind: 'transactional', category: 'essential', trigger: 'Address needs confirming' },
  'password-reset': { kind: 'transactional', category: 'essential', trigger: 'Password reset requested' },
  'sign-in-alert': { kind: 'transactional', category: 'essential', trigger: 'Sign-in from a new device' },
  'security-alert': { kind: 'transactional', category: 'essential', trigger: 'Security event on the account' },
  'student-verification-code': { kind: 'transactional', category: 'essential', trigger: 'Student verification code requested' },

  // --- Billing (essential) ---
  'subscription-started': { kind: 'transactional', category: 'essential', trigger: 'Subscription started' },
  'subscription-upgraded': { kind: 'transactional', category: 'essential', trigger: 'Plan upgraded' },
  'subscription-downgraded': { kind: 'transactional', category: 'essential', trigger: 'Plan downgraded' },
  'subscription-cancelled': { kind: 'transactional', category: 'essential', trigger: 'Subscription cancelled' },
  'payment-successful': { kind: 'transactional', category: 'essential', trigger: 'Payment taken' },
  'payment-failed': { kind: 'transactional', category: 'essential', trigger: 'Payment declined' },
  'payment-retry': { kind: 'transactional', category: 'essential', trigger: 'Payment retry scheduled' },
  'payment-refunded': { kind: 'transactional', category: 'essential', trigger: 'Refund issued' },
  'invoice-receipt': { kind: 'transactional', category: 'essential', trigger: 'Receipt for a charge' },

  // --- Verification decisions (essential) ---
  'verification-submitted': { kind: 'transactional', category: 'essential', trigger: 'Verification request received' },
  'verification-approved': { kind: 'transactional', category: 'essential', trigger: 'Verification approved' },
  'verification-rejected': { kind: 'transactional', category: 'essential', trigger: 'Verification rejected' },
  'verification-needs-info': { kind: 'transactional', category: 'essential', trigger: 'Verification needs more information' },

  // --- Product notifications (opt-out) ---
  'job-match': { kind: 'transactional', category: 'job_matches', trigger: 'A saved search matched a new role' },
  'application-followup': { kind: 'transactional', category: 'application_reminders', trigger: 'A follow-up the user scheduled is due' },
  'resume-analysis': { kind: 'transactional', category: 'product_insights', trigger: 'A resume the user uploaded finished analysis' },
  'ats-score-update': { kind: 'transactional', category: 'product_insights', trigger: 'An ATS score the user requested changed' },
  'interview-completed': { kind: 'transactional', category: 'product_insights', trigger: 'A mock interview the user ran finished' },
  'interview-report': { kind: 'transactional', category: 'product_insights', trigger: 'An interview report finished generating' },
  'career-plan': { kind: 'transactional', category: 'product_insights', trigger: 'A career plan the user requested is ready' },
}

/** Templates that always send regardless of preferences. */
export function isEssential(templateName: string): boolean {
  return EMAIL_CLASSIFICATIONS[templateName]?.category === 'essential'
}

/** True when the template is marketing-shaped and must never be queued. */
export function isMarketing(templateName: string): boolean {
  return EMAIL_CLASSIFICATIONS[templateName]?.kind === 'marketing'
}

/** Preference category for a template; unknown templates are treated as essential. */
export function categoryOf(templateName: string): EmailCategory {
  return EMAIL_CLASSIFICATIONS[templateName]?.category ?? 'essential'
}
