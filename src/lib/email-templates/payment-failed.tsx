import * as React from "react";
import {
  appUrl,
  Badge,
  BulletList,
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

export interface PaymentFailedProps {
  firstName?: string;
  planName?: string;
  amount?: string;
  failureReason?: string;
  attemptedAt?: string;
  paymentMethod?: string;
  gracePeriodEnds?: string;
  updatePaymentUrl?: string;
  billingUrl?: string;
}

const Email = ({
  firstName,
  planName = "Pro",
  amount = "—",
  failureReason,
  attemptedAt,
  paymentMethod,
  gracePeriodEnds,
  updatePaymentUrl,
  billingUrl,
}: PaymentFailedProps) => (
  <EmailShell
    preview="We couldn't process your Gradr payment — update your card to keep access."
    eyebrow="Action required"
    accent="mahogany"
  >
    <Headline>We couldn&apos;t process your payment</Headline>
    <Paragraph>
      Hi {greetName(firstName)} — your latest Gradr {planName} payment was declined.{" "}
      <Badge tone="danger">Payment failed</Badge> Your premium features are still on for now, but they&apos;ll
      pause{gracePeriodEnds ? ` on ${gracePeriodEnds}` : " shortly"} unless the payment succeeds.
    </Paragraph>

    <DetailTable
      rows={[
        { label: "Amount due", value: amount, strong: true },
        { label: "Plan", value: `Gradr ${planName}` },
        ...(paymentMethod ? [{ label: "Card on file", value: paymentMethod }] : []),
        ...(attemptedAt ? [{ label: "Attempted", value: attemptedAt }] : []),
        ...(failureReason ? [{ label: "Reason given by bank", value: failureReason }] : []),
      ]}
    />

    <CTAGroup
      primaryHref={appUrl(updatePaymentUrl, "/billing")}
      primaryLabel="Update payment method"
      secondaryHref={appUrl(billingUrl, "/billing")}
      secondaryLabel="View billing"
    />

    <Card tone="neutral" title="Most declines are fixed in under a minute">
      <BulletList
        tone="neutral"
        items={[
          "Check the card hasn't expired and has available funds",
          "Approve the charge in your banking app if it flagged it as unusual",
          "Try a different card — we accept all major providers",
        ]}
      />
    </Card>

    <Small>We&apos;ll retry the charge automatically. No action is needed if you&apos;ve already updated your card.</Small>
  </EmailShell>
);

export const template = {
  component: Email,
  subject: "Action needed: your Gradr payment didn't go through",
  displayName: "Payment failed",
  previewData: {
    firstName: "Andrew",
    planName: "Pro",
    amount: "$19.00",
    failureReason: "Insufficient funds",
    paymentMethod: "Visa ending 4242",
    gracePeriodEnds: "20 August 2026",
  },
} satisfies TemplateEntry;
