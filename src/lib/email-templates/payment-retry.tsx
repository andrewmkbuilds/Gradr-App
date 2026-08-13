import * as React from "react";
import {
  appUrl,
  Card,
  CTAGroup,
  DetailTable,
  EmailShell,
  greetName,
  Headline,
  Paragraph,
  Small,
} from "./_kit";
import type { TemplateEntry } from "./registry";

export interface PaymentRetryProps {
  firstName?: string;
  planName?: string;
  amount?: string;
  attemptNumber?: number;
  maxAttempts?: number;
  nextRetryDate?: string;
  suspensionDate?: string;
  updatePaymentUrl?: string;
  billingUrl?: string;
}

const Email = ({
  firstName,
  planName = "Pro",
  amount = "—",
  attemptNumber = 2,
  maxAttempts = 4,
  nextRetryDate,
  suspensionDate,
  updatePaymentUrl,
  billingUrl,
}: PaymentRetryProps) => (
  <EmailShell
    preview="We're retrying your Gradr payment — update your card to avoid interruption."
    eyebrow="Payment recovery"
    accent="mahogany"
  >
    <Headline>We&apos;re retrying your payment</Headline>
    <Paragraph>
      Hi {greetName(firstName)} — attempt {attemptNumber} of {maxAttempts} for your Gradr {planName} plan
      didn&apos;t succeed. We&apos;ll try again automatically, but updating your card now is the fastest way to
      keep everything running.
    </Paragraph>

    <DetailTable
      rows={[
        { label: "Amount outstanding", value: amount, strong: true },
        { label: "Retry attempt", value: `${attemptNumber} of ${maxAttempts}` },
        ...(nextRetryDate ? [{ label: "Next automatic retry", value: nextRetryDate }] : []),
        ...(suspensionDate ? [{ label: "Access pauses on", value: suspensionDate }] : []),
      ]}
    />

    <Card tone="warning" title="What happens if all retries fail">
      <Paragraph muted>
        Your plan moves to the free tier. Nothing is deleted — your resumes, applications and interview reports
        stay exactly where they are, and reactivating restores full access instantly.
      </Paragraph>
    </Card>

    <CTAGroup
      primaryHref={appUrl(updatePaymentUrl, "/billing")}
      primaryLabel="Update card now"
      secondaryHref={appUrl(billingUrl, "/billing")}
      secondaryLabel="Billing history"
    />

    <Small>If you&apos;ve already fixed your payment method, you can ignore this — the next retry will clear it.</Small>
  </EmailShell>
);

export const template = {
  component: Email,
  subject: "We're retrying your Gradr payment",
  displayName: "Payment retry / recovery",
  previewData: {
    firstName: "Andrew",
    planName: "Pro",
    amount: "$19.00",
    attemptNumber: 2,
    maxAttempts: 4,
    nextRetryDate: "16 August 2026",
    suspensionDate: "22 August 2026",
  },
} satisfies TemplateEntry;
