/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { Card, Cta, DetailTable, EmailLayout, Paragraph, greeting, link } from './components.tsx'
import type { TemplateEntry } from './registry.ts'

interface Props {
  firstName?: string
  verificationType?: string
  submittedAt?: string
  reviewWindow?: string
  referenceId?: string
}

const Email = ({ firstName, verificationType, submittedAt, reviewWindow, referenceId }: Props) => (
  <EmailLayout
    preview="We received your eligibility verification."
    eyebrow="Eligibility verification"
    headline="We've received your documents"
    campaign="verification-submitted"
  >
    <Paragraph>{greeting(firstName)}</Paragraph>
    <Paragraph>
      Your {verificationType || 'student'} verification is in the review queue. We'll email you the moment a decision is
      made — no need to resubmit.
    </Paragraph>
    <DetailTable
      rows={[
        { label: 'Verification type', value: verificationType || 'Student' },
        { label: 'Submitted', value: submittedAt || 'Just now' },
        { label: 'Reference', value: referenceId || '—' },
        { label: 'Typical review time', value: reviewWindow || 'Within 2 business days' },
      ]}
    />
    <Card title="While you wait">
      <Paragraph>
        Your account keeps working normally. If your discount is approved, it's applied automatically at checkout.
      </Paragraph>
    </Card>
    <Cta href={link('/pricing', 'verification-submitted')}>View my plan options</Cta>
  </EmailLayout>
)

export const template = {
  component: Email,
  subject: 'We received your Gradr verification',
  displayName: 'Verification submitted',
  previewData: {
    firstName: 'Andrew',
    verificationType: 'Student',
    submittedAt: '13 Aug 2026',
    reviewWindow: 'Within 2 business days',
    referenceId: 'VER-4821',
  },
} satisfies TemplateEntry
