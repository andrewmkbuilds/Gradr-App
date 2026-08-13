/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { Card, Cta, EmailLayout, FallbackUrl, Paragraph, greeting } from './components.tsx'
import type { TemplateEntry } from './registry.ts'

interface Props {
  firstName?: string
  resetUrl?: string
  expiresInMinutes?: number
  requestedFrom?: string
}

const Email = ({ firstName, resetUrl, expiresInMinutes, requestedFrom }: Props) => (
  <EmailLayout
    preview="Reset your Gradr password."
    eyebrow="Password reset"
    headline="Reset your password"
    campaign="password-reset"
    footerNote="If you didn't request this, no action is needed — your password stays unchanged."
  >
    <Paragraph>{greeting(firstName)}</Paragraph>
    <Paragraph>
      Use the button below to choose a new password. The link expires in {expiresInMinutes ?? 60} minutes and can only
      be used once.
    </Paragraph>
    <Cta href={resetUrl || '#'}>Set a new password</Cta>
    {requestedFrom ? (
      <Card tone="mahogany" title="Request details">
        <Paragraph>Requested from {requestedFrom}. If that wasn't you, secure your account immediately.</Paragraph>
      </Card>
    ) : null}
    <FallbackUrl href={resetUrl || '#'} />
  </EmailLayout>
)

export const template = {
  component: Email,
  subject: 'Reset your Gradr password',
  displayName: 'Password reset',
  previewData: {
    firstName: 'Andrew',
    resetUrl: 'https://gradr.me/auth/reset?token=example',
    expiresInMinutes: 60,
    requestedFrom: 'Chrome on macOS · Dubai, UAE',
  },
} satisfies TemplateEntry
