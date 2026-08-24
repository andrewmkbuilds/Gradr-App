/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { appLink, Bullets, Card, Cta, DetailTable, EmailLayout, greeting, link, Paragraph, SecondaryLink } from './components.tsx'
import type { TemplateEntry } from './registry.ts'

interface Props {
  firstName?: string
  jobTitle?: string
  companyName?: string
  appliedAt?: string
  lastTouchAt?: string
  daysSinceLastTouch?: number
  stage?: string
  suggestedMessage?: string
  applicationUrl?: string
}

const Email = ({
  firstName,
  jobTitle,
  companyName,
  appliedAt,
  lastTouchAt,
  daysSinceLastTouch,
  stage,
  suggestedMessage,
  applicationUrl,
}: Props) => (
  <EmailLayout
    preview={`Time to follow up with ${companyName || 'this company'}.`}
    eyebrow="Application tracking"
    headline={`Follow up with ${companyName || 'your contact'}`}
    tone="mahogany"
    campaign="application-followup"
    footerNote="You receive follow-up reminders based on the cadence set in your dashboard preferences."
  >
    <Paragraph>{greeting(firstName)}</Paragraph>
    <Paragraph>
      It's been {daysSinceLastTouch ?? 7} days since your last contact about {jobTitle || 'this role'}. A short,
      specific nudge is the single highest-return action on a stalled application.
    </Paragraph>
    <DetailTable
      rows={[
        { label: 'Role', value: jobTitle || '—' },
        { label: 'Company', value: companyName || '—' },
        { label: 'Stage', value: stage || 'Applied' },
        { label: 'Applied', value: appliedAt || '—' },
        { label: 'Last touch', value: lastTouchAt || '—' },
      ]}
    />
    {suggestedMessage ? (
      <Card tone="mahogany" title="Suggested message">
        <Paragraph>{suggestedMessage}</Paragraph>
      </Card>
    ) : (
      <Card tone="mahogany" title="Keep it to three lines">
        <Bullets
          tone="mahogany"
          items={[
            'Reference the role and the date you applied.',
            'Add one new, specific piece of value since then.',
            'Ask a single clear question about next steps.',
          ]}
        />
      </Card>
    )}
    <Cta href={applicationUrl || link('/applications', 'application-followup')} tone="mahogany">
      Open this application
    </Cta>
    <SecondaryLink href={appLink('/settings', 'application-followup')}>Change reminder cadence</SecondaryLink>
  </EmailLayout>
)

export const template = {
  component: Email,
  subject: (d: Props) => `Follow up: ${d?.jobTitle || 'your application'} at ${d?.companyName || 'this company'}`,
  displayName: 'Application follow-up reminder',
  previewData: {
    firstName: 'Andrew',
    jobTitle: 'Senior Product Designer',
    companyName: 'Northwind',
    appliedAt: '30 Jul 2026',
    lastTouchAt: '6 Aug 2026',
    daysSinceLastTouch: 7,
    stage: 'Applied — no response',
  },
} satisfies TemplateEntry
