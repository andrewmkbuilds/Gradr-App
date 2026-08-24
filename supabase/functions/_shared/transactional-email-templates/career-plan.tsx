/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { Card, Cta, EmailLayout, Paragraph, PriorityList, SecondaryLink, greeting, link } from './components.tsx'
import type { TemplateEntry } from './registry.ts'

interface Step {
  title: string
  detail?: string
  priority?: 'high' | 'medium' | 'low'
  href?: string
  day?: string
}

interface Props {
  firstName?: string
  horizonLabel?: string
  focus?: string
  steps?: Step[]
}

const Email = ({ firstName, horizonLabel, focus, steps }: Props) => (
  <EmailLayout
    preview="Your personalised action plan is ready."
    eyebrow="Career planning"
    headline={`Your ${horizonLabel || '3-day'} plan is ready`}
    campaign="career-plan"
  >
    <Paragraph>{greeting(firstName)}</Paragraph>
    <Paragraph>
      We sequenced your next actions around what actually moves your search forward — applications, tailoring, outreach
      and interview prep, in the order that compounds.
    </Paragraph>
    {focus ? (
      <Card tone="mahogany" title="This plan's focus">
        <Paragraph>{focus}</Paragraph>
      </Card>
    ) : null}
    <PriorityList
      items={(steps || []).map((s) => ({
        title: s.day ? `${s.day} — ${s.title}` : s.title,
        detail: s.detail,
        priority: s.priority,
        href: s.href ? link(s.href, 'career-plan') : undefined,
      }))}
    />
    <Cta href={appLink('/dashboard', 'career-plan')}>Open my plan</Cta>
    <SecondaryLink href={appLink('/dashboard', 'career-plan')}>Mark steps complete as you go</SecondaryLink>
  </EmailLayout>
)

export const template = {
  component: Email,
  subject: (d: Props) => `Your ${d?.horizonLabel || '3-day'} career plan is ready`,
  displayName: 'Career plan generated',
  previewData: {
    firstName: 'Andrew',
    horizonLabel: '3-day',
    focus: 'Convert your four strongest matches into submitted, tailored applications before Friday.',
    steps: [
      { day: 'Day 1', title: 'Tailor your resume for Helio Labs', detail: 'Three keyword edits lift the match to 88%.', priority: 'high', href: '/resume' },
      { day: 'Day 2', title: 'Submit two applications', detail: 'Northwind and Helio Labs are both above 85% match.', priority: 'high', href: '/apply' },
      { day: 'Day 3', title: 'Run a behavioural mock interview', detail: 'Target the confidence pillar — your lowest score.', priority: 'medium', href: '/interview' },
    ],
  },
} satisfies TemplateEntry
