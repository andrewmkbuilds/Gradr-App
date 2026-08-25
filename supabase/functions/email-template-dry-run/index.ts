import * as React from 'npm:react@18.3.1'
import { renderAsync } from 'npm:@react-email/components@0.0.22'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { TEMPLATES } from '../_shared/transactional-email-templates/registry.ts'
import { EmailFooterContext, POSTAL_ADDRESS } from '../_shared/transactional-email-templates/footerContext.ts'
import {
  categoryOf,
  EMAIL_CLASSIFICATIONS,
  isMarketing,
} from '../_shared/transactional-email-templates/classification.ts'

/**
 * Admin template sandbox — renders a template and evaluates every gate the real
 * send path applies (classification, preferences, suppression list), WITHOUT
 * queueing or sending anything.
 *
 * Nothing here calls `enqueue_email`. The only write is a `dry_run` row in
 * `email_delivery_audit`, which the weekly report explicitly excludes.
 */

interface Decision {
  recipient: string
  recipientUserId: string | null
  wouldSend: boolean
  blockedBy: string | null
  reason: string | null
}

function decodeJwtClaims(token: string): Record<string, unknown> | null {
  try {
    const payload = token.split('.')[1]
    return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')))
  } catch {
    return null
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) return json({ error: 'Server configuration error' }, 500)

  // --- Admin gate. The sandbox exposes rendered templates and recipient
  // preference state, so it is admin-only and verified server-side.
  const bearer = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
  const claims = decodeJwtClaims(bearer)
  const callerId = typeof claims?.sub === 'string' ? claims.sub : null
  if (!callerId) return json({ error: 'Authentication required' }, 401)

  const supabase = createClient(supabaseUrl, serviceKey)
  const { data: isAdmin, error: roleError } = await supabase.rpc('has_role', {
    _user_id: callerId,
    _role: 'admin',
  })
  if (roleError) return json({ error: 'Failed to verify permissions' }, 500)
  if (isAdmin !== true) return json({ error: 'Admin role required' }, 403)

  let templateName = ''
  let recipients: string[] = []
  let templateData: Record<string, unknown> | null = null
  /** Address the preview is personalised for. Rendering only — never a send. */
  let previewRecipient: string | null = null
  /** Preview mode renders the template and skips gate evaluation + audit writes. */
  let previewOnly = false
  try {
    const body = await req.json()
    templateName = String(body.templateName ?? '')
    recipients = Array.isArray(body.recipients)
      ? body.recipients.map((r: unknown) => String(r).trim()).filter(Boolean).slice(0, 25)
      : []
    if (body.templateData && typeof body.templateData === 'object') templateData = body.templateData
    if (body.previewRecipient) previewRecipient = String(body.previewRecipient).trim() || null
    previewOnly = body.previewOnly === true
  } catch {
    return json({ error: 'Invalid JSON in request body' }, 400)
  }


  if (!templateName) return json({ error: 'templateName is required' }, 400)
  const template = TEMPLATES[templateName]
  if (!template) return json({ error: `Unknown template '${templateName}'` }, 404)

  const classification = EMAIL_CLASSIFICATIONS[templateName] ?? null
  const category = categoryOf(templateName)
  const templateBlocked = !classification
    ? 'unclassified'
    : isMarketing(templateName)
      ? 'marketing_blocked'
      : null

  // --- Per-recipient evaluation, same order as the real send path.
  const decisions: Decision[] = []
  for (const recipient of previewOnly ? [] : recipients) {
    const normalized = recipient.toLowerCase()
    let blockedBy: string | null = templateBlocked
    let reason: string | null = templateBlocked
      ? templateBlocked === 'marketing_blocked'
        ? 'Template is classified marketing — the send path refuses it'
        : 'Template has no classification — the send path refuses it'
      : null

    // Recipient account id is resolved by the audit trigger for real sends;
    // the sandbox never needs it and does not read auth.users.
    const recipientUserId: string | null = null

    if (!blockedBy && category !== 'essential') {
      const { data: allowed, error: prefError } = await supabase.rpc('email_category_allowed', {
        _email: recipient,
        _category: category,
      })
      if (prefError) {
        blockedBy = 'preference_check_failed'
        reason = 'Preference lookup failed — the send path fails closed and would not send'
      } else if (allowed === false) {
        blockedBy = 'preference_opt_out'
        reason = `Recipient opted out of ${category}`
      }
    }

    if (!blockedBy) {
      const { data: suppressed, error: supErr } = await supabase
        .from('suppressed_emails')
        .select('id, reason')
        .eq('email', normalized)
        .maybeSingle()
      if (supErr) {
        blockedBy = 'suppression_check_failed'
        reason = 'Suppression lookup failed — the send path fails closed and would not send'
      } else if (suppressed) {
        blockedBy = 'suppressed'
        reason = (suppressed as { reason?: string }).reason || 'Address is on the suppression list'
      }
    }

    if (!blockedBy) {
      const { data: token } = await supabase
        .from('email_unsubscribe_tokens')
        .select('used_at')
        .eq('email', normalized)
        .maybeSingle()
      if (token && (token as { used_at?: string }).used_at) {
        blockedBy = 'unsubscribed'
        reason = 'Recipient used their one-click unsubscribe link'
      }
    }

    decisions.push({
      recipient,
      recipientUserId,
      wouldSend: !blockedBy,
      blockedBy,
      reason,
    })
  }

  // --- Render (never sent).
  let html = ''
  let subject = ''
  let renderError: string | null = null
  const baseData = templateData ?? template.previewData ?? {}

  // Personalise the preview for one recipient: their account display name (when
  // the address belongs to a Gradr user) and address are merged in where the
  // template's own data does not already provide them.
  let previewProfile: { email: string; fullName: string | null } | null = null
  if (previewRecipient) {
    let fullName: string | null = null
    const { data: userRow } = await supabase
      .from('email_delivery_audit')
      .select('recipient_user_id')
      .eq('recipient_email', previewRecipient)
      .not('recipient_user_id', 'is', null)
      .limit(1)
      .maybeSingle()
    const userId = (userRow as { recipient_user_id?: string } | null)?.recipient_user_id ?? null
    if (userId) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('user_id', userId)
        .maybeSingle()
      fullName = (profile as { display_name?: string } | null)?.display_name ?? null
    }
    previewProfile = { email: previewRecipient, fullName }
  }

  const data: Record<string, unknown> = previewProfile
    ? {
        ...baseData,
        name:
          previewProfile.fullName ??
          (baseData as Record<string, unknown>).name ??
          previewProfile.email.split('@')[0],
        firstName:
          previewProfile.fullName?.split(' ')[0] ??
          (baseData as Record<string, unknown>).firstName ??
          previewProfile.email.split('@')[0],
        email: previewProfile.email,
        recipientEmail: previewProfile.email,
      }
    : (baseData as Record<string, unknown>)


  try {
    html = await renderAsync(
      React.createElement(
        EmailFooterContext.Provider,
        {
          value: {
            unsubscribeUrl: 'https://app.gradr.me/unsubscribe?token=DRY-RUN',
            postalAddress: POSTAL_ADDRESS || undefined,
          },
        },
        React.createElement(template.component, data as never),
      ),
    )
    subject = typeof template.subject === 'function' ? template.subject(data) : template.subject
  } catch (err) {
    renderError = err instanceof Error ? err.message : 'Render failed'
  }

  // --- Audit the dry run itself so the trail shows who probed what.
  // A pure preview writes nothing: it renders and returns, no queue, no audit.
  if (!previewOnly && decisions.length > 0) {
    await supabase.from('email_delivery_audit').insert(
      decisions.map((d) => ({
        event: 'dry_run',
        template_name: templateName,
        kind: classification?.kind ?? null,
        category,
        category_label: classification ? category : 'Unclassified',
        recipient_email: d.recipient,
        recipient_user_id: d.recipientUserId,
        reason: d.reason ?? 'Would send',
        source: 'sandbox',
        metadata: { would_send: d.wouldSend, blocked_by: d.blockedBy, requested_by: callerId },
      })),
    )
  }

  return json({
    templateName,
    displayName: template.displayName ?? templateName,
    classification,
    category,
    templateBlocked,
    subject,
    html,
    renderError,
    decisions,
    previewRecipient,
    previewOnly,
    dryRun: true,
    sent: false,

  })
})
