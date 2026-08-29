/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { appLink, Cta, DetailTable, EmailLayout, greeting, Paragraph, SecondaryLink } from './components.tsx'
import type { TemplateEntry } from './registry.ts'

interface Props {
  firstName?: string
  planName?: string
  cancelledAt?: string
  accessUntil?: string
}

const Email = ({ firstName, planName, cancelledAt, accessUntil }: Props) => (
  <EmailLayout
    preview="Your Gradr trial was cancelled — you have not been charged."
    eyebrow="Free trial"
    headline="Your trial is cancelled — nothing was charged"
    campaign="trial-cancelled"
  >
    <Paragraph>{greeting(firstName)}</Paragraph>
    <Paragraph>
      Your {planName || 'Pro'} trial has been cancelled and no payment will be taken. You keep full access until the
      trial period runs out, and your account stays on the free plan after that — nothing is deleted.
    </Paragraph>
    <DetailTable
      rows={[
        { label: 'Plan', value: planName || 'Pro' },
        { label: 'Cancelled', value: cancelledAt || '—' },
        { label: 'Access until', value: accessUntil || '—' },
        { label: 'Charged', value: '$0.00' },
      ]}
    />
    <Cta href={appLink('/pricing', 'trial-cancelled')}>Restart my plan any time</Cta>
    <SecondaryLink href={appLink('/dashboard', 'trial-cancelled')}>Back to my dashboard</SecondaryLink>
  </EmailLayout>
)

export const template = {
  component: Email,
  subject: 'Your Gradr trial was cancelled — no charge',
  displayName: 'Trial cancelled',
  previewData: {
    firstName: 'Andrew',
    planName: 'Pro',
    cancelledAt: '2 Sep 2026',
    accessUntil: '6 Sep 2026',
  },
} satisfies TemplateEntry
