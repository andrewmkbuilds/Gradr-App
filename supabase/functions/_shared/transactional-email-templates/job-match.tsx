/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Bullets,
  Card,
  Chips,
  Cta,
  DetailTable,
  EmailLayout,
  Paragraph,
  ScoreBlock,
  SecondaryLink,
  greeting,
  link,
} from './components.tsx'
import type { TemplateEntry } from './registry.ts'

interface Props {
  firstName?: string
  jobTitle?: string
  companyName?: string
  location?: string
  salaryRange?: string
  matchScore?: number
  whyItMatches?: string[]
  keySkills?: string[]
  postedAt?: string
  jobUrl?: string
}

const Email = ({
  firstName,
  jobTitle,
  companyName,
  location,
  salaryRange,
  matchScore,
  whyItMatches,
  keySkills,
  postedAt,
  jobUrl,
}: Props) => {
  const href = jobUrl || link('/jobs', 'job-match')
  return (
    <EmailLayout
      preview={`${matchScore ?? 0}% match — ${jobTitle || 'A new role'} at ${companyName || 'a company'}`}
      eyebrow="Job matching"
      headline={`${jobTitle || 'A new role'} at ${companyName || 'a company you should see'}`}
      campaign="job-match"
      footerNote="You receive job match alerts because they're enabled in your notification preferences."
    >
      <Paragraph>{greeting(firstName)}</Paragraph>
      <Paragraph>
        This role scored high against your resume and target profile — here's the breakdown before you apply.
      </Paragraph>
      <ScoreBlock score={matchScore ?? 0} label="Match score" tone="teal" caption="Weighted on skills, seniority, domain and location fit." />
      <DetailTable
        rows={[
          { label: 'Role', value: jobTitle || '—' },
          { label: 'Company', value: companyName || '—' },
          { label: 'Location', value: location || '—' },
          ...(salaryRange ? [{ label: 'Compensation', value: salaryRange }] : []),
          ...(postedAt ? [{ label: 'Posted', value: postedAt }] : []),
        ]}
      />
      {whyItMatches?.length ? (
        <Card tone="mahogany" title="Why it matches you">
          <Bullets tone="mahogany" items={whyItMatches} />
        </Card>
      ) : null}
      {keySkills?.length ? (
        <>
          <Paragraph>
            <strong>Skills the posting emphasises</strong>
          </Paragraph>
          <Chips items={keySkills} />
        </>
      ) : null}
      <Cta href={href}>View and apply</Cta>
      <SecondaryLink href={link('/apply', 'job-match')}>Generate a tailored application pack</SecondaryLink>
    </EmailLayout>
  )
}

export const template = {
  component: Email,
  subject: (d: Props) =>
    `${d?.matchScore ?? 0}% match: ${d?.jobTitle || 'New role'} at ${d?.companyName || 'a top company'}`,
  displayName: 'Job match notification',
  previewData: {
    firstName: 'Andrew',
    jobTitle: 'Senior Product Designer',
    companyName: 'Northwind',
    location: 'Dubai, UAE · Hybrid',
    salaryRange: 'AED 28,000 – 34,000 / month',
    matchScore: 91,
    whyItMatches: [
      'Your last two roles map directly to the product scope in this posting.',
      'You already show 8 of the 10 required skills on your latest resume.',
      'Seniority and location preferences both align.',
    ],
    keySkills: ['Design systems', 'Prototyping', 'User research', 'Figma', 'Motion'],
    postedAt: '2 days ago',
  },
} satisfies TemplateEntry
