/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Bullets,
  Card,
  Chips,
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
  resumeName?: string
  atsScore?: number
  matchScore?: number
  strengths?: string[]
  topImprovement?: string
  missingKeywords?: string[]
  reportUrl?: string
}

const Email = ({
  firstName,
  resumeName,
  atsScore,
  matchScore,
  strengths,
  topImprovement,
  missingKeywords,
  reportUrl,
}: Props) => (
  <EmailLayout
    preview={`Your resume scored ${atsScore ?? 0}/100 on ATS readiness.`}
    eyebrow="Resume intelligence"
    headline="Your resume analysis is ready"
    campaign="resume-analysis"
  >
    <Paragraph>{greeting(firstName)}</Paragraph>
    <Paragraph>
      We finished analysing {resumeName ? <strong>{resumeName}</strong> : 'your resume'}. Here's the summary — the full
      report has line-by-line rewrite suggestions.
    </Paragraph>
    <ScoreBlock score={atsScore ?? 0} label="ATS readiness" tone="teal" caption="Parsing, structure, keywords and impact language." />
    {typeof matchScore === 'number' ? (
      <MetricList items={[{ label: 'Role match score', value: matchScore, tone: 'mahogany' }]} />
    ) : null}
    {strengths?.length ? (
      <Card title="What's working">
        <Bullets items={strengths} />
      </Card>
    ) : null}
    {topImprovement ? (
      <Card tone="mahogany" title="Highest-impact fix">
        <Paragraph>{topImprovement}</Paragraph>
      </Card>
    ) : null}
    {missingKeywords?.length ? (
      <>
        <Paragraph>
          <strong>Keywords worth adding</strong>
        </Paragraph>
        <Chips items={missingKeywords} tone="mahogany" />
      </>
    ) : null}
    <Cta href={reportUrl || appLink('/resume', 'resume-analysis')}>View full report</Cta>
    <SecondaryLink href={appLink('/match', 'resume-analysis')}>See roles this resume matches</SecondaryLink>
  </EmailLayout>
)

export const template = {
  component: Email,
  subject: (d: Props) => `Your resume scored ${d?.atsScore ?? 0}/100 on ATS readiness`,
  displayName: 'Resume analysis completed',
  previewData: {
    firstName: 'Andrew',
    resumeName: 'Andrew_Product_Designer_2026.pdf',
    atsScore: 78,
    matchScore: 84,
    strengths: [
      'Strong quantified outcomes in your two most recent roles.',
      'Clean single-column structure that parses reliably.',
    ],
    topImprovement: 'Your summary reads as duties rather than outcomes — lead with a measurable result in the first line.',
    missingKeywords: ['design systems', 'stakeholder management', 'A/B testing'],
  },
} satisfies TemplateEntry
