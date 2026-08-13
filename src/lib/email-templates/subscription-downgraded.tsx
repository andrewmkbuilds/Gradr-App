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

export interface SubscriptionDowngradedProps {
  firstName?: string;
  previousPlan?: string;
  planName?: string;
  effectiveDate?: string;
  amount?: string;
  losingFeatures?: string[];
  billingUrl?: string;
  pricingUrl?: string;
}

const Email = ({
  firstName,
  previousPlan = "Pro",
  planName = "Starter",
  effectiveDate,
  amount,
  losingFeatures = [],
  billingUrl,
  pricingUrl,
}: SubscriptionDowngradedProps) => (
  <EmailShell
    preview={`Your plan changes to Gradr ${planName}${effectiveDate ? ` on ${effectiveDate}` : ""}.`}
    eyebrow="Plan change scheduled"
    accent="mahogany"
  >
    <Headline>Your plan is moving to {planName}</Headline>
    <Paragraph>
      Hi {greetName(firstName)} — we&apos;ve recorded your change from {previousPlan} to {planName}. You keep
      full {previousPlan} access until the end of the current billing period, so nothing stops working today.
    </Paragraph>

    <DetailTable
      rows={[
        { label: "Current plan", value: previousPlan },
        { label: "New plan", value: `Gradr ${planName}`, strong: true },
        ...(amount ? [{ label: "New amount", value: amount }] : []),
        ...(effectiveDate ? [{ label: "Takes effect", value: effectiveDate }] : []),
      ]}
    />

    {losingFeatures.length > 0 ? (
      <Card tone="warning" title="No longer included after the change">
        <BulletList tone="warning" items={losingFeatures} />
      </Card>
    ) : null}

    <Paragraph muted>
      Your resumes, applications, interview reports and career plan all stay in your account regardless of plan.
    </Paragraph>

    <CTAGroup
      primaryHref={appUrl(billingUrl, "/billing")}
      primaryLabel="Manage subscription"
      secondaryHref={appUrl(pricingUrl, "/pricing")}
      secondaryLabel="Compare plans"
    />

    <Small>Changed your mind? You can undo this before the effective date from your billing settings.</Small>
  </EmailShell>
);

export const template = {
  component: Email,
  subject: (data: Record<string, any>) => `Your Gradr plan changes to ${data?.planName || "Starter"}`,
  displayName: "Subscription downgraded",
  previewData: {
    firstName: "Andrew",
    previousPlan: "Pro",
    planName: "Starter",
    effectiveDate: "13 September 2026",
    losingFeatures: ["Unlimited mock interviews", "Advanced ATS rewriting"],
  },
} satisfies TemplateEntry;
