/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { appLink, Cta, DetailTable, EmailLayout, greeting, Paragraph, SecondaryLink } from './components.tsx'
import type { TemplateEntry } from './registry.ts'

interface Props {
  firstName?: string
  planName?: string
  trialEndsOn?: string
  daysLeft?: number
  amount?: string
  interval?: string
}

const Email = ({ firstName, planName, trialEndsOn, daysLeft, amount, interval }: Props) => (
  <EmailLayout
    preview={`Your Gradr trial ends ${trialEndsOn || 'soon'}.`}
    eyebrow="Free trial"
    headline={
      daysLeft === 1
        ? 'Your trial ends tomorrow'
        : `Your trial ends in ${daysLeft || 3} days`
    }
    campaign="trial-ending"
  >
    <Paragraph>{greeting(firstName)}</Paragraph>
    <Paragraph>
      Heads up — your {planName || 'Pro'} trial finishes on {trialEndsOn || 'your trial end date'}. If you keep it,
      your first payment is taken then and nothing else changes. If it is not for you, cancel before that date and
      you will not be charged.
    </Paragraph>
    <DetailTable
      rows={[
        { label: 'Plan', value: planName || 'Pro' },
        { label: 'Trial ends', value: trialEndsOn || '—' },
        { label: 'First charge', value: `${amount || '$19.00'} / ${interval || 'month'}` },
      ]}
    />
    <Cta href={appLink('/dashboard', 'trial-ending')}>Keep using {planName || 'Pro'}</Cta>
    <SecondaryLink href={appLink('/subscription', 'trial-ending')}>Cancel before I am charged</SecondaryLink>
  </EmailLayout>
)

export const template = {
  component: Email,
  subject: (d: Props) =>
    d?.daysLeft === 1
      ? `Your Gradr trial ends tomorrow`
      : `Your Gradr trial ends in ${d?.daysLeft || 3} days`,
  displayName: 'Trial ending soon',
  previewData: {
    firstName: 'Andrew',
    planName: 'Pro',
    trialEndsOn: '6 Sep 2026',
    daysLeft: 3,
    amount: '$19.00',
    interval: 'month',
  },
} satisfies TemplateEntry
