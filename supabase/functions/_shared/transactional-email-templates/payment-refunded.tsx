/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { appLink, Card, Cta, DetailTable, EmailLayout, greeting, link, Paragraph } from './components.tsx'
import type { TemplateEntry } from './registry.ts'

interface Props {
  firstName?: string
  amount?: string
  refundedAt?: string
  summary?: string
  billingUrl?: string
}

const Email = ({ firstName, amount, refundedAt, summary, billingUrl }: Props) => {
  const href = billingUrl || appLink('/billing', 'payment-refunded')
  return (
    <EmailLayout
      preview="Your Gradr refund has been processed."
      eyebrow="Refund processed"
      headline="Your refund is on its way"
      campaign="payment-refunded"
    >
      <Paragraph>{greeting(firstName)}</Paragraph>
      <Paragraph>
        We've processed a refund of {amount || '$0.00'}. Depending on your bank, it can take 5–10 business days to
        appear on your statement.
      </Paragraph>
      <DetailTable
        rows={[
          { label: 'Amount refunded', value: amount || '$0.00' },
          { label: 'Processed', value: refundedAt || 'Today' },
        ]}
      />
      <Card title="What changed on your account">
        <Paragraph>{summary || 'Your account access has been updated to match the refund.'}</Paragraph>
      </Card>
      <Cta href={href}>View billing history</Cta>
    </EmailLayout>
  )
}

export const template = {
  component: Email,
  subject: 'Your Gradr refund has been processed',
  displayName: 'Payment refunded',
  previewData: {
    firstName: 'Andrew',
    amount: '$19.00',
    refundedAt: '13 Aug 2026',
    summary: 'Plan access has ended. 50 application credits were removed.',
  },
} satisfies TemplateEntry
