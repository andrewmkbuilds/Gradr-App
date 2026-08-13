/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { Cta, EmailLayout, FallbackUrl, Paragraph, greeting } from './components.tsx'
import type { TemplateEntry } from './registry.ts'

interface Props {
  firstName?: string
  confirmationUrl?: string
  expiresInMinutes?: number
}

const Email = ({ firstName, confirmationUrl, expiresInMinutes }: Props) => (
  <EmailLayout
    preview="Confirm your email to activate your Gradr account."
    eyebrow="Confirm your email"
    headline="Confirm your email address"
    campaign="email-verification"
    footerNote="If you didn't create a Gradr account, you can safely ignore this email."
  >
    <Paragraph>{greeting(firstName)}</Paragraph>
    <Paragraph>
      One click confirms your address and activates your account. This link expires in{' '}
      {expiresInMinutes ?? 60} minutes.
    </Paragraph>
    <Cta href={confirmationUrl || '#'}>Confirm my email</Cta>
    <FallbackUrl href={confirmationUrl || '#'} />
  </EmailLayout>
)

export const template = {
  component: Email,
  subject: 'Confirm your Gradr email address',
  displayName: 'Email verification',
  previewData: { firstName: 'Andrew', confirmationUrl: 'https://gradr.me/auth/confirm?token=example', expiresInMinutes: 60 },
} satisfies TemplateEntry
