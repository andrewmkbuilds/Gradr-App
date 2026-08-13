/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { Bullets, Card, Cta, DetailTable, EmailLayout, Paragraph, SecondaryLink, greeting, link } from './components.tsx'
import type { TemplateEntry } from './registry.ts'

interface Props {
  firstName?: string
  verificationType?: string
  reason?: string
  reviewedAt?: string
  canResubmit?: boolean
}

const Email = ({ firstName, verificationType, reason, reviewedAt, canResubmit }: Props) => (
  <EmailLayout
    preview="We couldn't verify your eligibility yet."
    eyebrow="Verification update"
    headline="We couldn't approve your verification"
    tone="mahogany"
    campaign="verification-rejected"
  >
    <Paragraph>{greeting(firstName)}</Paragraph>
    <Paragraph>
      We reviewed your {verificationType || 'student'} verification but couldn't approve it with the documents
      provided.
    </Paragraph>
    <DetailTable
      rows={[
        { label: 'Verification type', value: verificationType || 'Student' },
        { label: 'Reviewed', value: reviewedAt || 'Today' },
        { label: 'Reason', value: reason || 'Document was unreadable or expired.' },
      ]}
    />
    {canResubmit !== false ? (
      <Card tone="mahogany" title="What usually fixes it">
        <Bullets
          tone="mahogany"
          items={[
            'A document dated within the last 6 months.',
            'Your full name and the institution clearly visible.',
            'A flat, well-lit photo or an original PDF — no cropped screenshots.',
          ]}
        />
      </Card>
    ) : null}
    <Cta href={link('/pricing', 'verification-rejected')} tone="mahogany">
      Resubmit documents
    </Cta>
    <SecondaryLink href={link('/pricing', 'verification-rejected')}>See standard pricing</SecondaryLink>
  </EmailLayout>
)

export const template = {
  component: Email,
  subject: 'Update on your Gradr verification',
  displayName: 'Verification rejected',
  previewData: {
    firstName: 'Andrew',
    verificationType: 'Student',
    reason: 'The enrolment document was dated more than 12 months ago.',
    reviewedAt: '13 Aug 2026',
    canResubmit: true,
  },
} satisfies TemplateEntry
