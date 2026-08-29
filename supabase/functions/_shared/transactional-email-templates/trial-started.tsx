/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { appLink, Bullets, Card, Cta, DetailTable, EmailLayout, greeting, Paragraph, SecondaryLink } from './components.tsx'
import type { TemplateEntry } from './registry.ts'

interface Props {
  firstName?: string
  planName?: string
  trialDays?: number
  trialEndsOn?: string
  interval?: string
}

const Email = ({ firstName, planName, trialDays, trialEndsOn }: Props) => (
  <EmailLayout
    preview={`Your ${trialDays || 7}-day Gradr ${planName || 'Pro'} trial has started.`}
    eyebrow="Free trial"
    headline={`Your ${trialDays || 7}-day ${planName || 'Pro'} trial is live`}
    campaign="trial-started"
  >
    <Paragraph>{greeting(firstName)}</Paragraph>
    <Paragraph>
      Everything on {planName || 'Pro'} is unlocked right now. You have not been charged — we only bill when the
      trial ends, and you can cancel any time before then from your subscription page.
    </Paragraph>
    <DetailTable
      rows={[
        { label: 'Plan', value: planName || 'Pro' },
        { label: 'Trial length', value: `${trialDays || 7} days` },
        { label: 'Trial ends', value: trialEndsOn || '—' },
        { label: 'Charged today', value: '$0.00' },
      ]}
    />
    <Card tone="mahogany" title="Get the most out of your trial">
      <Bullets
        tone="mahogany"
        items={[
          'Run a full AI mock interview and read the scored report',
          'Upload your resume for an ATS breakdown and rewrite',
          'Match against three live roles and generate application packs',
        ]}
      />
    </Card>
    <Cta href={appLink('/dashboard', 'trial-started')}>Start using {planName || 'Pro'}</Cta>
    <SecondaryLink href={appLink('/subscription', 'trial-started')}>Manage or cancel my trial</SecondaryLink>
  </EmailLayout>
)

export const template = {
  component: Email,
  subject: (d: Props) => `Your ${d?.trialDays || 7}-day Gradr ${d?.planName || 'Pro'} trial has started`,
  displayName: 'Trial started',
  previewData: {
    firstName: 'Andrew',
    planName: 'Pro',
    trialDays: 7,
    trialEndsOn: '6 Sep 2026',
  },
} satisfies TemplateEntry
