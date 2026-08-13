import * as React from "react";
import {
  appUrl,
  Badge,
  CTAGroup,
  DetailTable,
  EmailShell,
  greetName,
  Headline,
  Paragraph,
  Small,
} from "./_kit";
import type { TemplateEntry } from "./registry";

export interface PaymentSuccessfulProps {
  firstName?: string;
  planName?: string;
  amount?: string;
  paidAt?: string;
  paymentMethod?: string;
  nextBillingDate?: string;
  invoiceNumber?: string;
  invoiceUrl?: string;
  billingUrl?: string;
}

const Email = ({
  firstName,
  planName = "Pro",
  amount = "—",
  paidAt,
  paymentMethod,
  nextBillingDate,
  invoiceNumber,
  invoiceUrl,
  billingUrl,
}: PaymentSuccessfulProps) => (
  <EmailShell preview={`Payment received — ${amount} for Gradr ${planName}.`} eyebrow="Payment received">
    <Headline>Payment received</Headline>
    <Paragraph>
      Hi {greetName(firstName)} — thanks, your payment went through and your Gradr {planName} plan continues
      without interruption. <Badge tone="success">Paid</Badge>
    </Paragraph>

    <DetailTable
      accent="teal"
      rows={[
        { label: "Amount", value: amount, strong: true },
        { label: "Plan", value: `Gradr ${planName}` },
        ...(invoiceNumber ? [{ label: "Invoice", value: invoiceNumber }] : []),
        ...(paymentMethod ? [{ label: "Payment method", value: paymentMethod }] : []),
        ...(paidAt ? [{ label: "Paid on", value: paidAt }] : []),
        ...(nextBillingDate ? [{ label: "Next billing date", value: nextBillingDate }] : []),
      ]}
    />

    <CTAGroup
      primaryHref={appUrl(invoiceUrl, "/billing")}
      primaryLabel="View receipt"
      secondaryHref={appUrl(billingUrl, "/billing")}
      secondaryLabel="Manage billing"
    />

    <Small>This email is your confirmation of payment. Keep it for your records.</Small>
  </EmailShell>
);

export const template = {
  component: Email,
  subject: (data: Record<string, any>) => `Payment received — Gradr ${data?.planName || "Pro"}`,
  displayName: "Payment successful",
  previewData: {
    firstName: "Andrew",
    planName: "Pro",
    amount: "$19.00",
    paidAt: "13 August 2026",
    paymentMethod: "Visa ending 4242",
    invoiceNumber: "GR-2026-00184",
  },
} satisfies TemplateEntry;
