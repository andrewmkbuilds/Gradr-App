/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { appLink, Bullets, Cta, EmailLayout, FallbackUrl, greeting, link, Paragraph, SecondaryLink } from './components.tsx'
import type { TemplateEntry } from './registry.ts'

interface Props {
  firstName?: string
  targetRole?: string
}

const Email = ({ firstName, targetRole }: Props) => {
  const cta = link('/onboarding', 'welcome')
  return (
    <EmailLayout
      preview="Your AI career command center is ready."
      eyebrow="Welcome to Gradr"
      headline="Your AI career command center is ready"
      campaign="welcome"
    >
      <Paragraph>{greeting(firstName)}</Paragraph>
      <Paragraph>
        Gradr turns a scattered job search into one system: a resume that clears ATS filters, roles matched to your
        profile{targetRole ? ` as a ${targetRole}` : ''}, and interview practice with instant, structured feedback.
      </Paragraph>
      <Paragraph>Three minutes of setup gets you a personalised plan:</Paragraph>
      <Bullets
        tone="mahogany"
        items={[
          'Upload a resume — get an ATS score, keyword gaps and rewrite suggestions.',
          'Set target roles and salary — matches re-rank instantly.',
          'Run a mock interview — scored on communication, confidence and depth.',
        ]}
      />
      <Cta href={cta}>Set up my career profile</Cta>
      <SecondaryLink href={appLink('/resume', 'welcome')}>Or start with a resume analysis</SecondaryLink>
      <FallbackUrl href={cta} />
    </EmailLayout>
  )
}

export const template = {
  component: Email,
  subject: (d: Props) => (d?.firstName ? `${d.firstName}, your Gradr career OS is ready` : 'Welcome to Gradr'),
  displayName: 'Welcome / account created',
  previewData: { firstName: 'Andrew', targetRole: 'Product Designer' },
} satisfies TemplateEntry
