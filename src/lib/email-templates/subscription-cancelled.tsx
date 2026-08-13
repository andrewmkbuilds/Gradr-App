import * as React from "react";
import {
  appUrl,
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

export interface SubscriptionCancelledProps {
  firstName?: string;
  planName?: string;
  accessUntil?: string;
  reason?: string;
  reactivateUrl?: string;
  exportUrl?: string;
}

const Email = ({
  firstName,
  planName = "Pro",
  accessUntil,
  reason,
  reactivateUrl,
  exportUrl,
}: SubscriptionCancelledProps) => (
  <EmailShell
    preview={`Your Gradr ${planName} subscription has been cancelled.`}
    eyebrow="Subscription cancelled"
    accent="mahogany"
  >
    <Headline>Your {planName} plan has been cancelled</Headline>
    <Paragraph>
      Hi {greetName(firstName)} — we&apos;ve cancelled your Gradr {planName} subscription and you won&apos;t be
      billed again. Thank you for the time you spent building your career with us.
    </Paragraph>

    <DetailTable
      rows={[
        { label: "Plan cancelled", value: `Gradr ${planName}`, strong: true },
        ...(accessUntil ? [{ label: "Access continues until", value: accessUntil }] : []),
        ...(reason ? [{ label: "Reason", value: reason }] : []),
        { label: "Future charges", value: "None" },
      ]}
    />

    <Card tone="neutral" title="Your data is safe">
      <BulletList
        tone="neutral"
        items={[
          "Resumes, applications and interview reports stay in your account",
          "You keep free-tier access to your dashboard and career plan",
          "You can export everything at any time, or reactivate in one click",
        ]}
      />
    </Card>

    <CTAGroup
      primaryHref={appUrl(reactivateUrl, "/pricing")}
      primaryLabel="Reactivate my plan"
      secondaryHref={appUrl(exportUrl, "/settings")}
      secondaryLabel="Export my data"
    />

    <Small>
      If something specific pushed you to cancel, reply to this email — real feedback shapes what we build next.
    </Small>
  </EmailShell>
);

export const template = {
  component: Email,
  subject: "Your Gradr subscription has been cancelled",
  displayName: "Subscription cancelled",
  previewData: { firstName: "Andrew", planName: "Pro", accessUntil: "13 September 2026" },
} satisfies TemplateEntry;
