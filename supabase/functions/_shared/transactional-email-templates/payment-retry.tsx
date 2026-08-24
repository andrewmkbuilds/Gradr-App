/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { appLink, Card, Cta, DetailTable, EmailLayout, greeting, link, Paragraph } from './components.tsx'
import type { TemplateEntry } from './registry.ts'

interface Props {
  firstName?: string
  amount?: string
  planName?: string
  attemptNumber?: number
  maxAttempts?: number
  nextRetryDate?: string
  updatePaymentUrl?: string
}

const Email = ({ firstName, amount, planName, attemptNumber, maxAttempts, nextRetryDate, updatePaymentUrl }: Props) => {
  const href = updatePaymentUrl || appLink('/billing', 'payment-retry')
  return (
    <EmailLayout
      preview="We're retrying your Gradr payment."
      eyebrow="Payment recovery"
      headline="We're retrying your payment"
      tone="warning"
      campaign="payment-retry"
    >
      <Paragraph>{greeting(firstName)}</Paragraph>
      <Paragraph>
        Your {planName || 'Pro'} charge of {amount || '$19.00'} hasn't gone through yet. We'll try again automatically —
        no action is needed if your card details are already correct.
      </Paragraph>
      <DetailTable
        rows={[
          { label: 'Amount due', value: amount || '$19.00' },
          { label: 'Retry attempt', value: `${attemptNumber ?? 1} of ${maxAttempts ?? 4}` },
          { label: 'Next attempt', value: nextRetryDate || 'In 2 days' },
          { label: 'Account status', value: 'Active — grace period' },
        ]}
      />
      <Card tone="warning" title="Skip the wait">
        <Paragraph>
          Updating your payment method charges the outstanding amount straight away and restores normal billing.
        </Paragraph>
      </Card>
      <Cta href={href} tone="mahogany">
        Pay now / update card
      </Cta>
    </EmailLayout>
  )
}

export const template = {
  component: Email,
  subject: (d: Props) => `Retrying your Gradr payment of ${d?.amount || '$19.00'}`,
  displayName: 'Payment retry / recovery',
  previewData: {
    firstName: 'Andrew',
    amount: '$19.00',
    planName: 'Pro',
    attemptNumber: 2,
    maxAttempts: 4,
    nextRetryDate: '16 Aug 2026',
  },
} satisfies TemplateEntry
