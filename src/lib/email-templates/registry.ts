import type { ComponentType } from 'react'

export interface TemplateEntry {
  component: ComponentType<any>
  subject: string | ((data: Record<string, any>) => string)
  displayName?: string
  previewData?: Record<string, any>
  /** Fixed recipient — overrides caller-provided recipientEmail when set. */
  to?: string
}

import { template as welcome } from './welcome'
import { template as emailVerification } from './email-verification'
import { template as passwordReset } from './password-reset'
import { template as securitySignin } from './security-signin'
import { template as subscriptionStarted } from './subscription-started'
import { template as subscriptionUpgraded } from './subscription-upgraded'
import { template as subscriptionDowngraded } from './subscription-downgraded'
import { template as subscriptionCancelled } from './subscription-cancelled'
import { template as paymentSuccessful } from './payment-successful'
import { template as paymentFailed } from './payment-failed'
import { template as paymentRetry } from './payment-retry'
import { template as invoiceReceipt } from './invoice-receipt'
import { template as trialEnding } from './trial-ending'
import { template as usageLimitWarning } from './usage-limit-warning'
import { template as resumeAnalysisComplete } from './resume-analysis-complete'
import { template as atsScoreUpdate } from './ats-score-update'
import { template as jobMatch } from './job-match'
import { template as dailyBriefing } from './daily-briefing'
import { template as applicationStatusUpdate } from './application-status-update'
import { template as applicationFollowupReminder } from './application-followup-reminder'
import { template as interviewScheduled } from './interview-scheduled'
import { template as interviewCompleted } from './interview-completed'
import { template as interviewReport } from './interview-report'
import { template as verificationApproved } from './verification-approved'
import { template as verificationRejected } from './verification-rejected'

/**
 * Template registry — maps template names to their React Email components.
 * Import and register new templates here after creating them in this directory.
 */
export const TEMPLATES: Record<string, TemplateEntry> = {
  welcome,
  'email-verification': emailVerification,
  'password-reset': passwordReset,
  'security-signin': securitySignin,
  'subscription-started': subscriptionStarted,
  'subscription-upgraded': subscriptionUpgraded,
  'subscription-downgraded': subscriptionDowngraded,
  'subscription-cancelled': subscriptionCancelled,
  'payment-successful': paymentSuccessful,
  'payment-failed': paymentFailed,
  'payment-retry': paymentRetry,
  'invoice-receipt': invoiceReceipt,
  'trial-ending': trialEnding,
  'usage-limit-warning': usageLimitWarning,
  'resume-analysis-complete': resumeAnalysisComplete,
  'ats-score-update': atsScoreUpdate,
  'job-match': jobMatch,
  'daily-briefing': dailyBriefing,
  'application-status-update': applicationStatusUpdate,
  'application-followup-reminder': applicationFollowupReminder,
  'interview-scheduled': interviewScheduled,
  'interview-completed': interviewCompleted,
  'interview-report': interviewReport,
  'verification-approved': verificationApproved,
  'verification-rejected': verificationRejected,
}
