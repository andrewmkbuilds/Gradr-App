/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { Card, Cta, DetailTable, EmailLayout, Paragraph, greeting, link } from './components.tsx'
import type { TemplateEntry } from './registry.ts'

interface Props {
  firstName?: string
  email?: string
  device?: string
  browser?: string
  location?: string
  ipAddress?: string
  signedInAt?: string
  method?: string
}

const Email = ({ firstName, email, device, browser, location, ipAddress, signedInAt, method }: Props) => (
  <EmailLayout
    preview="A new sign-in to your Gradr account"
    eyebrow="Account security"
    headline="New sign-in to your Gradr account"
    tone="mahogany"
    campaign="sign-in-alert"
    footerNote="You receive security notifications like this one regardless of your email preferences."
  >
    <Paragraph>{greeting(firstName)}</Paragraph>
    <Paragraph>
      We noticed a sign-in to {email ? <strong>{email}</strong> : 'your account'}. If this was you, no action is
      needed.
    </Paragraph>
    <DetailTable
      rows={[
        { label: 'When', value: signedInAt || 'Just now' },
        { label: 'Method', value: method || 'Email and password' },
        { label: 'Device', value: device || 'Unknown device' },
        { label: 'Browser', value: browser || 'Unknown browser' },
        { label: 'Approx. location', value: location || 'Unavailable' },
        { label: 'IP address', value: ipAddress || 'Unavailable' },
      ]}
    />
    <Card tone="mahogany" title="Didn't recognise this?">
      <Paragraph>
        Reset your password immediately and review active sessions in your account settings. If anything looks wrong,
        reply to this email and our team will lock the account.
      </Paragraph>
    </Card>
    <Cta href={appLink('/settings', 'sign-in-alert')} tone="mahogany">
      Review account security
    </Cta>
  </EmailLayout>
)

export const template = {
  component: Email,
  subject: 'New sign-in to your Gradr account',
  displayName: 'Sign-in / security notification',
  previewData: {
    firstName: 'Andrew',
    email: 'andrew@example.com',
    device: 'MacBook Pro',
    browser: 'Chrome 128',
    location: 'Dubai, UAE',
    ipAddress: '84.23.11.4',
    signedInAt: '13 Aug 2026, 20:04 GST',
    method: 'Google',
  },
} satisfies TemplateEntry
