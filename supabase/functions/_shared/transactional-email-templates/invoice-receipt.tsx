/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { Cta, DetailTable, EmailLayout, Paragraph, SecondaryLink, greeting, link } from './components.tsx'
import type { TemplateEntry } from './registry.ts'

interface Props {
  firstName?: string
  invoiceNumber?: string
  issuedAt?: string
  planName?: string
  interval?: string
  subtotal?: string
  discount?: string
  tax?: string
  total?: string
  billingEmail?: string
  invoiceUrl?: string
}

const Email = ({
  firstName,
  invoiceNumber,
  issuedAt,
  planName,
  interval,
  subtotal,
  discount,
  tax,
  total,
  billingEmail,
  invoiceUrl,
}: Props) => (
  <EmailLayout
    preview={`Receipt ${invoiceNumber || ''} from Gradr`}
    eyebrow="Receipt"
    headline={`Receipt ${invoiceNumber || ''}`.trim()}
    campaign="invoice-receipt"
    footerNote="Keep this email for your records. Invoices are also available in your billing history."
  >
    <Paragraph>{greeting(firstName)}</Paragraph>
    <Paragraph>Here's your receipt for this billing period.</Paragraph>
    <DetailTable
      rows={[
        { label: 'Invoice number', value: invoiceNumber || '—' },
        { label: 'Issued', value: issuedAt || 'Today' },
        { label: 'Billed to', value: billingEmail || '—' },
        { label: 'Description', value: `Gradr ${planName || 'Pro'} — ${interval || 'monthly'} subscription` },
        { label: 'Subtotal', value: subtotal || total || '$19.00' },
        ...(discount ? [{ label: 'Discount', value: `− ${discount}` }] : []),
        { label: 'Tax', value: tax || '$0.00' },
        { label: 'Total paid', value: <strong>{total || '$19.00'}</strong> },
      ]}
    />
    <Cta href={invoiceUrl || link('/billing', 'invoice-receipt')}>Download invoice</Cta>
    <SecondaryLink href={link('/billing', 'invoice-receipt')}>See billing history</SecondaryLink>
  </EmailLayout>
)

export const template = {
  component: Email,
  subject: (d: Props) => `Your Gradr receipt ${d?.invoiceNumber || ''}`.trim(),
  displayName: 'Invoice / receipt',
  previewData: {
    firstName: 'Andrew',
    invoiceNumber: 'GR-2026-0841',
    issuedAt: '13 Aug 2026',
    planName: 'Pro',
    interval: 'annual',
    subtotal: '$160.00',
    tax: '$0.00',
    total: '$160.00',
    billingEmail: 'andrew@example.com',
  },
} satisfies TemplateEntry
