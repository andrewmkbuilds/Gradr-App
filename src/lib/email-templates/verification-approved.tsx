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

export interface VerificationApprovedProps {
  firstName?: string;
  programName?: string;
  discountLabel?: string;
  discountCode?: string;
  expiresAt?: string;
  pricingUrl?: string;
  billingUrl?: string;
}

const Email = ({
  firstName,
  programName = "Student verification",
  discountLabel = "your Gradr discount",
  discountCode,
  expiresAt,
  pricingUrl,
  billingUrl,
}: VerificationApprovedProps) => (
  <EmailShell preview={`You're verified — ${discountLabel} is active.`} eyebrow="Verification approved">
    <Headline>You&apos;re verified</Headline>
    <Paragraph>
      Hi {greetName(firstName)} — we reviewed your documents and approved your {programName.toLowerCase()}.{" "}
      <strong>{discountLabel}</strong> is now active on your account.
    </Paragraph>

    <DetailTable
      accent="teal"
      rows={[
        { label: "Programme", value: programName, strong: true },
        { label: "Discount", value: discountLabel, strong: true },
        ...(discountCode ? [{ label: "Code", value: discountCode }] : []),
        ...(expiresAt ? [{ label: "Valid until", value: expiresAt }] : []),
      ]}
    />

    <Card tone="success" title="What happens now">
      <Paragraph>
        The discounted price is applied automatically at checkout. If you already have a subscription, your
        next invoice reflects the new rate — no action needed.
      </Paragraph>
    </Card>

    <CTAGroup
      primaryHref={appUrl(pricingUrl, "/pricing")}
      primaryLabel="Claim your plan"
      secondaryHref={appUrl(billingUrl, "/billing")}
      secondaryLabel="Manage billing"
    />

    <Small>Verification is tied to your Gradr account and can&apos;t be transferred.</Small>
  </EmailShell>
);

export const template = {
  component: Email,
  subject: "You're verified — your Gradr discount is active",
  displayName: "Verification approved",
  previewData: {
    firstName: "Andrew",
    programName: "Student verification",
    discountLabel: "50% off Gradr Pro",
    discountCode: "STUDENT50",
    expiresAt: "31 December 2026",
  },
} satisfies TemplateEntry;
