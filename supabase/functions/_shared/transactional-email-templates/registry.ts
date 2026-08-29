/// <reference types="npm:@types/react@18.3.1" />
import type * as React from 'npm:react@18.3.1'

import { template as welcome } from './welcome.tsx'
import { template as emailVerification } from './email-verification.tsx'
import { template as passwordReset } from './password-reset.tsx'
import { template as signInAlert } from './sign-in-alert.tsx'
import { template as securityAlert } from './security-alert.tsx'
import { template as subscriptionStarted } from './subscription-started.tsx'
import { template as subscriptionUpgraded } from './subscription-upgraded.tsx'
import { template as subscriptionDowngraded } from './subscription-downgraded.tsx'
import { template as subscriptionCancelled } from './subscription-cancelled.tsx'
import { template as paymentSuccessful } from './payment-successful.tsx'
import { template as paymentFailed } from './payment-failed.tsx'
import { template as paymentRetry } from './payment-retry.tsx'
import { template as paymentRefunded } from './payment-refunded.tsx'
import { template as invoiceReceipt } from './invoice-receipt.tsx'
import { template as applicationFollowup } from './application-followup.tsx'
import { template as jobMatch } from './job-match.tsx'
import { template as resumeAnalysis } from './resume-analysis.tsx'
import { template as atsScoreUpdate } from './ats-score-update.tsx'
import { template as interviewCompleted } from './interview-completed.tsx'
import { template as interviewReport } from './interview-report.tsx'
import { template as careerPlan } from './career-plan.tsx'
import { template as verificationSubmitted } from './verification-submitted.tsx'
import { template as verificationApproved } from './verification-approved.tsx'
import { template as verificationRejected } from './verification-rejected.tsx'
import { template as verificationNeedsInfo } from './verification-needs-info.tsx'
import { template as trialStarted } from './trial-started.tsx'
import { template as trialEnding } from './trial-ending.tsx'
import { template as trialCancelled } from './trial-cancelled.tsx'
import { template as studentVerificationCode } from './student-verification-code.tsx'

export interface TemplateEntry {
  component: React.ComponentType<Record<string, unknown>>
  subject: string | ((data: Record<string, unknown>) => string)
  displayName?: string
  previewData?: Record<string, unknown>
  to?: string
}

/**
 * Registry of every Gradr lifecycle email.
 * Add a new template by creating a `.tsx` file that exports
 * `template satisfies TemplateEntry` and registering it here.
 */
export const TEMPLATES: Record<string, TemplateEntry> = {
  'welcome': welcome,
  'email-verification': emailVerification,
  'password-reset': passwordReset,
  'sign-in-alert': signInAlert,
  'security-alert': securityAlert,
  'trial-started': trialStarted,
  'trial-ending': trialEnding,
  'trial-cancelled': trialCancelled,
  'subscription-started': subscriptionStarted,
  'subscription-upgraded': subscriptionUpgraded,
  'subscription-downgraded': subscriptionDowngraded,
  'subscription-cancelled': subscriptionCancelled,
  'payment-successful': paymentSuccessful,
  'payment-failed': paymentFailed,
  'payment-retry': paymentRetry,
  'payment-refunded': paymentRefunded,
  'invoice-receipt': invoiceReceipt,
  'application-followup': applicationFollowup,
  'job-match': jobMatch,
  'resume-analysis': resumeAnalysis,
  'ats-score-update': atsScoreUpdate,
  'interview-completed': interviewCompleted,
  'interview-report': interviewReport,
  'career-plan': careerPlan,
  'verification-submitted': verificationSubmitted,
  'verification-approved': verificationApproved,
  'verification-rejected': verificationRejected,
  'verification-needs-info': verificationNeedsInfo,
  'student-verification-code': studentVerificationCode,
}

export type TemplateName = keyof typeof TEMPLATES
