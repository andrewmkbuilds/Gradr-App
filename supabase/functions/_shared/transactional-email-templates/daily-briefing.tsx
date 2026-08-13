/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Card,
  Cta,
  EmailLayout,
  MetricList,
  Paragraph,
  PriorityList,
  SecondaryLink,
  greeting,
  link,
} from './components.tsx'
import type { TemplateEntry } from './registry.ts'

interface Action {
  title: string
  detail?: string
  priority?: 'high' | 'medium' | 'low'
  href?: string
}

interface Props {
  firstName?: string
  dateLabel?: string
  readinessScore?: number
  activeApplications?: number
  newMatches?: number
  actions?: Action[]
  insight?: string
}

const Email = ({
  firstName,
  dateLabel,
  readinessScore,
  activeApplications,
  newMatches,
  actions,
  insight,
}: Props) => (
  <EmailLayout
    preview={`${actions?.length ?? 0} priority actions for today.`}
    eyebrow={dateLabel ? `Daily briefing · ${dateLabel}` : 'Daily briefing'}
    headline="Today's career priorities"
    campaign="daily-briefing"
    footerNote="You receive the Daily Career Briefing because it's enabled in your notification preferences."
  >
    <Paragraph>{greeting(firstName)}</Paragraph>
    <Paragraph>Three things move your search forward today. Start at the top.</Paragraph>
    <MetricList
      items={[
        { label: 'Career readiness', value: readinessScore ?? 0 },
        { label: 'Active applications', value: activeApplications ?? 0, raw: true, tone: 'mahogany' },
        { label: 'New matches', value: newMatches ?? 0, raw: true },
      ]}
    />
    <PriorityList items={(actions || []).map((a) => ({ ...a, href: a.href ? link(a.href, 'daily-briefing') : undefined }))} />
    {insight ? (
      <Card tone="mahogany" title="Insight">
        <Paragraph>{insight}</Paragraph>
      </Card>
    ) : null}
    <Cta href={link('/', 'daily-briefing')}>Open my dashboard</Cta>
    <SecondaryLink href={link('/settings', 'daily-briefing')}>Adjust briefing frequency</SecondaryLink>
  </EmailLayout>
)

export const template = {
  component: Email,
  subject: (d: Props) => `Your career briefing${d?.dateLabel ? ` — ${d.dateLabel}` : ''}`,
  displayName: 'Daily Career Briefing',
  previewData: {
    firstName: 'Andrew',
    dateLabel: 'Thursday, 13 Aug',
    readinessScore: 72,
    activeApplications: 9,
    newMatches: 4,
    actions: [
      {
        title: 'Follow up with Northwind',
        detail: 'No reply for 7 days on your Senior Product Designer application.',
        priority: 'high',
        href: '/applications',
      },
      {
        title: 'Tailor your resume for Helio Labs',
        detail: 'Match score jumps from 74% to an estimated 88% with three keyword edits.',
        priority: 'high',
        href: '/resume',
      },
      {
        title: 'Run a 15-minute behavioural drill',
        detail: 'Your confidence pillar is the lowest of the four.',
        priority: 'medium',
        href: '/interview',
      },
    ],
    insight: 'Applications you follow up on within 7 days get a reply 2.4x more often than the ones you leave.',
  },
} satisfies TemplateEntry
