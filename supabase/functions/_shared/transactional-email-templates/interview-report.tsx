/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Bullets,
  Card,
  Cta,
  EmailLayout,
  MetricList,
  Paragraph,
  ScoreBlock,
  SecondaryLink,
  greeting,
  link,
} from './components.tsx'
import type { TemplateEntry } from './registry.ts'

interface Props {
  firstName?: string
  role?: string
  overallScore?: number
  communicationScore?: number
  confidenceScore?: number
  technicalScore?: number
  structureScore?: number
  strengths?: string[]
  improvements?: string[]
  reportUrl?: string
}

const Email = ({
  firstName,
  role,
  overallScore,
  communicationScore,
  confidenceScore,
  technicalScore,
  structureScore,
  strengths,
  improvements,
  reportUrl,
}: Props) => (
  <EmailLayout
    preview={`You scored ${overallScore ?? 0}/100 in your mock interview.`}
    eyebrow="Interview scorecard"
    headline="Your interview report is ready"
    campaign="interview-report"
  >
    <Paragraph>{greeting(firstName)}</Paragraph>
    <Paragraph>
      Here's how your {role ? `${role} ` : ''}mock interview scored. The full report includes the transcript with
      timestamped feedback on each answer.
    </Paragraph>
    <ScoreBlock score={overallScore ?? 0} label="Overall performance" tone="teal" caption="Weighted across all four scoring pillars." />
    <MetricList
      items={[
        { label: 'Communication', value: communicationScore ?? 0 },
        { label: 'Confidence', value: confidenceScore ?? 0, tone: 'mahogany' },
        { label: 'Technical depth', value: technicalScore ?? 0 },
        { label: 'Structure (STAR)', value: structureScore ?? 0, tone: 'mahogany' },
      ]}
    />
    {strengths?.length ? (
      <Card title="Strengths">
        <Bullets items={strengths} />
      </Card>
    ) : null}
    {improvements?.length ? (
      <Card tone="mahogany" title="Areas to improve">
        <Bullets tone="mahogany" items={improvements} />
      </Card>
    ) : null}
    <Cta href={reportUrl || appLink('/interview', 'interview-report')}>View full scorecard</Cta>
    <SecondaryLink href={appLink('/interview', 'interview-report')}>Practise the weak areas</SecondaryLink>
  </EmailLayout>
)

export const template = {
  component: Email,
  subject: (d: Props) => `Your interview scorecard: ${d?.overallScore ?? 0}/100`,
  displayName: 'Interview report ready',
  previewData: {
    firstName: 'Andrew',
    role: 'Senior Product Designer',
    overallScore: 82,
    communicationScore: 88,
    confidenceScore: 74,
    technicalScore: 85,
    structureScore: 79,
    strengths: ['Clear, concise openings on every answer.', 'Strong concrete metrics in two of your three stories.'],
    improvements: [
      'Two answers stalled before the result — close each story with the outcome.',
      'Reduce filler words in the first 15 seconds of a response.',
    ],
  },
} satisfies TemplateEntry
