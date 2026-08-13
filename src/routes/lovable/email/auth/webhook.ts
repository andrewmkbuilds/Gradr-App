import * as React from 'react'
import { render } from '@react-email/render'
import { parseEmailWebhookPayload } from '@lovable.dev/email-js'
import { WebhookError, verifyWebhookRequest } from '@lovable.dev/webhooks-js'
import { createClient } from '@supabase/supabase-js'
import { createFileRoute } from '@tanstack/react-router'
import { SignupEmail } from '@/lib/email-templates/signup'
import { InviteEmail } from '@/lib/email-templates/invite'
import { MagicLinkEmail } from '@/lib/email-templates/magic-link'
import { RecoveryEmail } from '@/lib/email-templates/recovery'
import { EmailChangeEmail } from '@/lib/email-templates/email-change'
import { ReauthenticationEmail } from '@/lib/email-templates/reauthentication'

const EMAIL_SUBJECTS: Record<string, string> = {
  signup: 'Confirm your email for Gradr',
  invite: "You've been invited to Gradr",
  magiclink: 'Your Gradr sign-in link',
  recovery: 'Reset your Gradr password',
  email_change: 'Confirm your new Gradr email',
  reauthentication: 'Your Gradr verification code',
}

// Template mapping
const EMAIL_TEMPLATES: Record<string, React.ComponentType<any>> = {
  signup: SignupEmail,
  invite: InviteEmail,
  magiclink: MagicLinkEmail,
  recovery: RecoveryEmail,
  email_change: EmailChangeEmail,
  reauthentication: ReauthenticationEmail,
}

// Configuration
const SITE_NAME = "Gradr"
const SENDER_DOMAIN = "notify.gradr.me"
const ROOT_DOMAIN = "gradr.me"
const FROM_DOMAIN = "gradr.me"

function redactEmail(email: string | null | undefined): string {
  if (!email) return '***'
  const [localPart, domain] = email.split('@')
  if (!localPart || !domain) return '***'
  return `${localPart[0]}***@${domain}`
}

export const Route = createFileRoute("/lovable/email/auth/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env['LOVABLE_API_KEY']

        if (!apiKey) {
          console.error('LOVABLE_API_KEY not configured')
          return Response.json(
            { error: 'Server configuration error' },
            { status: 500 }
          )
        }

        // Verify signature + timestamp, then parse payload.
        let payload: any
        let run_id = ''
        try {
          const verified = await verifyWebhookRequest({
            req: request,
            secret: apiKey,
            parser: parseEmailWebhookPayload,
          })
          payload = verified.payload
          run_id = payload.run_id
        } catch (error) {
          if (error instanceof WebhookError) {
            switch (error.code) {
              case 'invalid_signature':
              case 'missing_timestamp':
              case 'invalid_timestamp':
              case 'stale_timestamp':
                console.error('Invalid webhook signature', { error: error.message })
                return Response.json(
                  { error: 'Invalid signature' },
                  { status: 401 }
                )
              case 'invalid_payload':
              case 'invalid_json':
                console.error('Invalid webhook payload', { error: error.message })
                return Response.json(
                  { error: 'Invalid webhook payload' },
                  { status: 400 }
                )
            }
          }

          console.error('Webhook verification failed', { error })
          return Response.json(
            { error: 'Invalid webhook payload' },
            { status: 400 }
          )
        }

        if (!run_id) {
          console.error('Webhook payload missing run_id')
          return Response.json(
            { error: 'Invalid webhook payload' },
            { status: 400 }
          )
        }

        if (payload.version !== '1') {
          console.error('Unsupported payload version', { version: payload.version, run_id })
          return Response.json(
            { error: `Unsupported payload version: ${payload.version}` },
            { status: 400 }
          )
        }

        // The email action type is in payload.data.action_type (e.g., "signup", "recovery")
        // payload.type is the hook event type ("auth")
        const emailType = payload.data.action_type
        console.log('Received auth event', {
          emailType,
          email_redacted: redactEmail(payload.data.email),
          run_id,
        })

        const EmailTemplate = EMAIL_TEMPLATES[emailType]
        if (!EmailTemplate) {
          console.error('Unknown email type', { emailType, run_id })
          return Response.json(
            { error: `Unknown email type: ${emailType}` },
            { status: 400 }
          )
        }

        // Allowlist gate. Supabase hands us `payload.data.url` verbatim, and its
        // `redirect_to` is where the browser is bounced *after* the token is
        // verified — an attacker-supplied value would turn our own signed link
        // into a phishing hop. Two outcomes:
        //   - off-allowlist landing path/host  → rewrite to a safe default
        //   - off-allowlist action host/scheme → refuse to send at all
        const { validateAuthRedirect } = await import('@/lib/email/authLinkAudit')
        const allowlist = validateAuthRedirect(payload.data.url)
        let actionUrl: string = payload.data.url
        let redirectSanitized = false

        if (!allowlist.allowed) {
          const hostProblem = allowlist.reasons.some(
            (reason) => reason.includes('Action host') || reason.includes('Action link uses'),
          )
          if (hostProblem) {
            console.error('Blocked auth email: action link is not allowlisted', {
              emailType,
              run_id,
              reasons: allowlist.reasons,
            })
            return Response.json(
              { error: 'Auth action link failed allowlist validation', reasons: allowlist.reasons },
              { status: 400 }
            )
          }
          // Redirect-only problem: keep the sign-in working, drop the target.
          try {
            const safe = new URL(actionUrl)
            safe.searchParams.set('redirect_to', `https://${ROOT_DOMAIN}/auth`)
            actionUrl = safe.toString()
            redirectSanitized = true
            console.warn('Rewrote non-allowlisted auth redirect target', {
              emailType,
              run_id,
              reasons: allowlist.reasons,
            })
          } catch {
            /* unparseable URLs were already rejected above */
          }
        }

        // Build template props from payload.data (HookData structure)
        const templateProps = {
          siteName: SITE_NAME,
          siteUrl: `https://${ROOT_DOMAIN}`,
          recipient: payload.data.email,
          confirmationUrl: actionUrl,
          magicLinkUrl: actionUrl,
          recoveryUrl: actionUrl,
          inviteUrl: actionUrl,
          token: payload.data.token,
          email: payload.data.email,
          oldEmail: payload.data.old_email,
          newEmail: payload.data.new_email,
        }


        // Render React Email to HTML and plain text
        const element = React.createElement(EmailTemplate, templateProps)
        const html = await render(element)
        const text = await render(element, { plainText: true })

        // Enqueue email for async processing by the dispatcher (process-email-queue).
        const supabaseUrl = import.meta.env['VITE_SUPABASE_URL']
        const supabaseServiceKey = process.env['SUPABASE_SERVICE_ROLE_KEY']

        if (!supabaseUrl || !supabaseServiceKey) {
          console.error('Missing Supabase environment variables')
          return Response.json(
            { error: 'Server configuration error' },
            { status: 500 }
          )
        }

        const supabase = createClient(supabaseUrl, supabaseServiceKey)
        const messageId = crypto.randomUUID()

        // Log pending BEFORE enqueue so we have a record even if enqueue crashes
        await supabase.from('email_send_log').insert({
          message_id: messageId,
          template_name: emailType,
          recipient_email: payload.data.email,
          status: 'pending',
        })

        // Audit trail: record WHICH dynamic action URL this email was built with.
        // Only a sanitized description is persisted (origin, path, type, redirect
        // target, SHA-256 digests) — never the single-use token, never the full
        // URL, and never any Supabase credential. Best-effort: an audit failure
        // must never block a user's sign-in email.
        try {
          const { describeAuthActionUrl } = await import('@/lib/email/authLinkAudit')
          const link = await describeAuthActionUrl(payload.data.url)
          const { error: auditError } = await supabase.from('auth_email_link_audit').insert({
            run_id,
            message_id: messageId,
            action_type: emailType,
            template_key: emailType,
            recipient_redacted: redactEmail(payload.data.email),
            link_origin: link.origin,
            link_path: link.path,
            link_type: link.linkType,
            redirect_to: link.redirectTo,
            token_param: link.tokenParam,
            token_digest: link.tokenDigest,
            url_digest: link.urlDigest,
            link_valid: link.valid,
          })
          if (auditError) {
            console.error('Failed to write auth link audit', { error: auditError.message, run_id })
          }
        } catch (error) {
          console.error('Auth link audit threw', { error, run_id })
        }



        const { error: enqueueError } = await supabase.rpc('enqueue_email', {
          queue_name: 'auth_emails',
          payload: {
            run_id,
            message_id: messageId,
            to: payload.data.email,
            from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
            sender_domain: SENDER_DOMAIN,
            subject: EMAIL_SUBJECTS[emailType] || 'Notification',
            html,
            text,
            purpose: 'transactional',
            label: emailType,
            queued_at: new Date().toISOString(),
          },
        })

        if (enqueueError) {
          console.error('Failed to enqueue auth email', { error: enqueueError, run_id, emailType })
          await supabase.from('email_send_log').insert({
            message_id: messageId,
            template_name: emailType,
            recipient_email: payload.data.email,
            status: 'failed',
            error_message: 'Failed to enqueue email',
          })
          return Response.json(
            { error: 'Failed to enqueue email' },
            { status: 500 }
          )
        }

        console.log('Auth email enqueued', {
          emailType,
          email_redacted: redactEmail(payload.data.email),
          run_id,
        })

        return Response.json({ success: true, queued: true })
      },
    },
  },
})
