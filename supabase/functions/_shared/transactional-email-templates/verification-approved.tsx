/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { Badge, Card, Cta, DetailTable, EmailLayout, Paragraph, greeting, link } from './components.tsx'
import type { TemplateEntry } from './registry.ts'

interface Props {
  firstName?: string
  verificationType?: string
  discountLabel?: string
  discountCode?: string
  expiresAt?: string
}

const Email = ({ firstName, verificationType, discountLabel, discountCode, expiresAt }: Props) => (
  <EmailLayout
    preview={`Approved — your ${discountLabel || 'discount'} is active.`}
    eyebrow="Verification approved"
    headline="You're verified — your discount is active"
    campaign="verification-approved"
  >
    <Paragraph>{greeting(firstName)}</Paragraph>
    <Paragraph>
      <Badge tone="success">Approved</Badge>
    </Paragraph>
    <Paragraph>
      Your {verificationType || 'student'} status is confirmed. The discount is attached to your account and applies
      automatically at checkout.
    </Paragraph>
    <DetailTable
      rows={[
        { label: 'Verification type', value: verificationType || 'Student' },
        { label: 'Discount', value: discountLabel || '50% off Pro' },
        ...(discountCode ? [{ label: 'Code', value: discountCode }] : []),
        { label: 'Valid until', value: expiresAt || '12 months from today' },
      ]}
    />
    <Card tone="mahogany" title="Use it now">
      <Paragraph>The discounted price shows on the pricing page while you're signed in.</Paragraph>
    </Card>
    <Cta href={link('/pricing', 'verification-approved')}>Claim my discounted plan</Cta>
  </EmailLayout>
)

export const template = {
  component: Email,
  subject: 'Approved — your Gradr discount is active',
  displayName: 'Verification approved',
  previewData: {
    firstName: 'Andrew',
    verificationType: 'Student',
    discountLabel: '50% off Pro',
    expiresAt: '13 Aug 2027',
  },
} satisfies TemplateEntry
