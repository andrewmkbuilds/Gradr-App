/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { Bullets, Card, Cta, EmailLayout, MetricList, Paragraph, ScoreBlock, greeting, link } from './components.tsx'
import type { TemplateEntry } from './registry.ts'

interface Props {
  firstName?: string
  resumeName?: string
  previousScore?: number
  newScore?: number
  versionLabel?: string
  changes?: string[]
  nextStep?: string
  reportUrl?: string
}

const Email = ({ firstName, resumeName, previousScore, newScore, versionLabel, changes, nextStep, reportUrl }: Props) => {
  const delta = (newScore ?? 0) - (previousScore ?? 0)
  const improved = delta >= 0
  return (
    <EmailLayout
      preview={`ATS score ${improved ? 'up' : 'down'} ${Math.abs(delta)} points.`}
      eyebrow="ATS tracking"
      headline={improved ? `Your ATS score went up ${delta} points` : `Your ATS score dropped ${Math.abs(delta)} points`}
      tone={improved ? 'teal' : 'warning'}
      campaign="ats-score-update"
    >
      <Paragraph>{greeting(firstName)}</Paragraph>
      <Paragraph>
        {versionLabel ? <strong>{versionLabel}</strong> : 'Your latest version'} of{' '}
        {resumeName || 'your resume'} has been re-scored.
      </Paragraph>
      <ScoreBlock
        score={newScore ?? 0}
        label="Current ATS score"
        tone={improved ? 'teal' : 'mahogany'}
        caption={`Previously ${previousScore ?? 0}/100`}
      />
      <MetricList
        items={[
          { label: 'Previous', value: previousScore ?? 0 },
          { label: 'Current', value: newScore ?? 0, tone: 'mahogany' },
        ]}
      />
      {changes?.length ? (
        <Card title="What changed">
          <Bullets items={changes} />
        </Card>
      ) : null}
      {nextStep ? (
        <Card tone="mahogany" title="Do this next">
          <Paragraph>{nextStep}</Paragraph>
        </Card>
      ) : null}
      <Cta href={reportUrl || appLink('/resume', 'ats-score-update')}>Compare versions</Cta>
    </EmailLayout>
  )
}

export const template = {
  component: Email,
  subject: (d: Props) => `ATS score update: ${d?.newScore ?? 0}/100`,
  displayName: 'ATS score update',
  previewData: {
    firstName: 'Andrew',
    resumeName: 'Andrew_Product_Designer_2026.pdf',
    previousScore: 71,
    newScore: 86,
    versionLabel: 'Version 4',
    changes: [
      'Added 6 of the 9 missing keywords from your target role.',
      'Rewrote three bullets into outcome-first phrasing.',
    ],
    nextStep: 'Run a job match with this version — three saved roles should now clear the 85% threshold.',
  },
} satisfies TemplateEntry
