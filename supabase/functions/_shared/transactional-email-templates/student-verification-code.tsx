/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { Card, EmailLayout, Paragraph, greeting } from './components.tsx'
import type { TemplateEntry } from './registry.ts'

interface Props {
  firstName?: string
  code?: string
  email?: string
  expiresInMinutes?: number
}

const Email = ({ firstName, code, email, expiresInMinutes }: Props) => (
  <EmailLayout
    preview={`Your Gradr student verification code is ${code ?? ''}`}
    eyebrow="Student verification"
    headline="Confirm your school email"
    campaign="student-verification-code"
    footerNote="If you didn't request a student discount on Gradr, you can safely ignore this email."
  >
    <Paragraph>{greeting(firstName)}</Paragraph>
    <Paragraph>
      Enter this code in Gradr to confirm that {email ?? 'this address'} belongs to you and unlock
      your student discount.
    </Paragraph>
    <Card>
      <p
        style={{
          margin: 0,
          fontSize: '32px',
          letterSpacing: '10px',
          fontWeight: 700,
          textAlign: 'center',
          color: '#245F73',
        }}
      >
        {code ?? '------'}
      </p>
    </Card>
    <Paragraph muted>
      The code expires in {expiresInMinutes ?? 15} minutes. We only check that you can receive mail
      at this address — no student ID or documents are required.
    </Paragraph>
  </EmailLayout>
)

export const template = {
  component: Email,
  subject: 'Your Gradr student verification code',
  displayName: 'Student verification code',
  previewData: { firstName: 'Andrew', code: '482913', email: 'you@university.edu', expiresInMinutes: 15 },
} satisfies TemplateEntry
