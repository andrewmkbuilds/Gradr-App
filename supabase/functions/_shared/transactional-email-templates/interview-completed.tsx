/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { Card, Cta, DetailTable, EmailLayout, Paragraph, SecondaryLink, greeting, link } from './components.tsx'
import type { TemplateEntry } from './registry.ts'

interface Props {
  firstName?: string
  role?: string
  interviewType?: string
  durationMinutes?: number
  questionsAnswered?: number
  completedAt?: string
}

const Email = ({ firstName, role, interviewType, durationMinutes, questionsAnswered, completedAt }: Props) => (
  <EmailLayout
    preview="Your mock interview is complete — the report is being scored."
    eyebrow="AI Mock Interview"
    headline="Interview complete — nice work"
    campaign="interview-completed"
  >
    <Paragraph>{greeting(firstName)}</Paragraph>
    <Paragraph>
      You finished a {interviewType || 'behavioural'} mock interview{role ? ` for ${role}` : ''}. We're scoring your
      answers now and your full report will land shortly.
    </Paragraph>
    <DetailTable
      rows={[
        { label: 'Role', value: role || '—' },
        { label: 'Format', value: interviewType || 'Behavioural' },
        { label: 'Duration', value: durationMinutes ? `${durationMinutes} minutes` : '—' },
        { label: 'Questions answered', value: String(questionsAnswered ?? '—') },
        { label: 'Completed', value: completedAt || 'Just now' },
      ]}
    />
    <Card tone="mahogany" title="While you wait">
      <Paragraph>
        Re-read your transcript while the session is fresh — the moments you'd phrase differently are the ones worth
        drilling in your next run.
      </Paragraph>
    </Card>
    <Cta href={appLink('/interview', 'interview-completed')}>Open my session</Cta>
    <SecondaryLink href={appLink('/interview', 'interview-completed')}>Book another practice run</SecondaryLink>
  </EmailLayout>
)

export const template = {
  component: Email,
  subject: 'Your Gradr mock interview is complete',
  displayName: 'Interview completed',
  previewData: {
    firstName: 'Andrew',
    role: 'Senior Product Designer',
    interviewType: 'Behavioural',
    durationMinutes: 24,
    questionsAnswered: 8,
    completedAt: 'Just now',
  },
} satisfies TemplateEntry
