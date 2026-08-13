/**
 * Authorization rules for the transactional send endpoint.
 *
 * A valid Supabase JWT alone is NOT sufficient: without these checks any
 * signed-in account could send password-reset / invoice / security-alert
 * emails from Gradr's verified domain to arbitrary recipients with
 * attacker-controlled links. Three independent limits apply to ordinary
 * callers:
 *   1. recipient must be the caller's own verified email
 *   2. template must be on the self-service allowlist (no auth/billing/admin)
 *   3. every URL in templateData must point at a Gradr-owned origin
 *
 * System callers (the queue/cron using the service role key) and admins are
 * exempt from 1 and 2, but URL validation still applies to everyone.
 */

/** Templates a user may trigger for themselves. Anything auth-, billing-,
 * or moderation-related is system-only: those carry trust-bearing links. */
export const SELF_SERVICE_TEMPLATES = new Set([
  'resume-analysis-complete',
  'ats-score-update',
  'job-match',
  'daily-briefing',
  'application-status-update',
  'application-followup-reminder',
  'interview-scheduled',
  'interview-completed',
  'interview-report',
])

const ALLOWED_URL_HOSTS = [
  'gradr.me',
  'www.gradr.me',
  'notify.gradr.me',
  'localhost',
  '127.0.0.1',
]

function hostAllowed(host: string): boolean {
  const h = host.toLowerCase()
  if (ALLOWED_URL_HOSTS.includes(h)) return true
  // Preview/published Lovable hosts for this project.
  return h.endsWith('.lovable.app') || h.endsWith('.lovable.dev')
}

/** Walks templateData and rejects any string that is an off-domain URL. */
export function findDisallowedUrl(value: unknown, depth = 0): string | null {
  if (depth > 6) return null
  if (typeof value === 'string') {
    const match = value.match(/\b(?:https?:)?\/\/[^\s"'<>)]+/i)
    if (!match) return null
    try {
      const raw = match[0].startsWith('//') ? `https:${match[0]}` : match[0]
      const url = new URL(raw)
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return match[0]
      return hostAllowed(url.hostname) ? null : match[0]
    } catch {
      return match[0]
    }
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const bad = findDisallowedUrl(item, depth + 1)
      if (bad) return bad
    }
    return null
  }
  if (value && typeof value === 'object') {
    for (const item of Object.values(value as Record<string, unknown>)) {
      const bad = findDisallowedUrl(item, depth + 1)
      if (bad) return bad
    }
  }
  return null
}

export interface SendAuthzInput {
  /** true when the bearer token was the service role key (queue/cron/system). */
  isSystem: boolean
  isAdmin: boolean
  callerEmail: string | null
  /** Resolved recipient (template fixed `to` already applied). */
  recipientEmail: string
  /** True when the template itself pins the recipient — caller can't steer it. */
  recipientFixedByTemplate: boolean
  templateName: string
  templateData: Record<string, unknown>
}

export interface SendAuthzResult {
  ok: boolean
  status?: number
  error?: string
}

export function authorizeSend(input: SendAuthzInput): SendAuthzResult {
  const badUrl = findDisallowedUrl(input.templateData)
  if (badUrl) {
    return {
      ok: false,
      status: 400,
      error: 'templateData contains a link to a non-Gradr domain',
    }
  }

  if (input.isSystem || input.isAdmin) return { ok: true }

  if (!SELF_SERVICE_TEMPLATES.has(input.templateName)) {
    return {
      ok: false,
      status: 403,
      error: `Template '${input.templateName}' can only be sent by Gradr's own systems`,
    }
  }

  if (input.recipientFixedByTemplate) return { ok: true }

  const caller = (input.callerEmail ?? '').trim().toLowerCase()
  if (!caller || caller !== input.recipientEmail.trim().toLowerCase()) {
    return {
      ok: false,
      status: 403,
      error: 'You can only send this email to your own account address',
    }
  }

  return { ok: true }
}
